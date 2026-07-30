/*
 * portfolio.js
 * Motor de "paper trading" (simulación con dinero virtual), persistido en localStorage.
 * Usa el método de coste medio ponderado (average cost) para las posiciones,
 * una simplificación didáctica frente al FIFO fiscal real explicado en el Nivel 3.
 *
 * PortfolioFactory(storageKey, defaultBalance) crea una cartera virtual independiente,
 * identificada por su propia clave de localStorage. Esto permite que Práctica, Invertir
 * y Trading tengan cada una su propio saldo y posiciones, sin interferir entre sí.
 *
 * Incluye también un motor de órdenes pendientes (limitadas y stop): una orden que no
 * es "a mercado" se guarda pendiente y se ejecuta automáticamente la próxima vez que
 * llega un precio nuevo que cumple la condición (ver checkPendingOrders).
 */

function PortfolioFactory(storageKey, defaultBalance) {
  var KEY = storageKey;
  var DEFAULT_BALANCE = defaultBalance || 10000;

  function defaultState(balance) {
    return {
      cash: balance,
      initialBalance: balance,
      positions: {},
      history: [],
      pendingOrders: []
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) {
        var s = defaultState(DEFAULT_BALANCE);
        save(s);
        return s;
      }
      var parsed = JSON.parse(raw);
      if (!parsed.pendingOrders) parsed.pendingOrders = [];
      return parsed;
    } catch (e) {
      return defaultState(DEFAULT_BALANCE);
    }
  }

  function save(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function getState() {
    return load();
  }

  function setState(state) {
    if (!state || typeof state !== "object") return;
    if (!state.pendingOrders) state.pendingOrders = [];
    save(state);
  }

  function reset(balance) {
    var s = defaultState(balance || DEFAULT_BALANCE);
    save(s);
    return s;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function execBuy(state, symbol, name, qty, price) {
    var cost = round2(qty * price);
    if (cost > state.cash + 0.0001) throw new Error("Saldo insuficiente para esta compra.");
    var pos = state.positions[symbol] || { qty: 0, avgCost: 0, name: name };
    var newQty = pos.qty + qty;
    var newAvgCost = (pos.qty * pos.avgCost + qty * price) / newQty;
    state.positions[symbol] = { qty: newQty, avgCost: newAvgCost, name: name };
    state.cash = round2(state.cash - cost);
    state.history.unshift({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      symbol: symbol,
      name: name,
      side: "buy",
      qty: qty,
      price: price,
      total: cost
    });
  }

  function execSell(state, symbol, qty, price) {
    var pos = state.positions[symbol];
    if (!pos || pos.qty <= 0) throw new Error("No tienes posición abierta en este valor.");
    if (qty > pos.qty + 0.0001) throw new Error("Cantidad a vender inválida.");
    var proceeds = round2(qty * price);
    var realizedPL = round2((price - pos.avgCost) * qty);
    var remainingQty = round2(pos.qty - qty);
    if (remainingQty <= 0.0001) delete state.positions[symbol];
    else state.positions[symbol] = { qty: remainingQty, avgCost: pos.avgCost, name: pos.name };
    state.cash = round2(state.cash + proceeds);
    state.history.unshift({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      symbol: symbol,
      name: pos.name,
      side: "sell",
      qty: qty,
      price: price,
      total: proceeds,
      realizedPL: realizedPL,
      avgCost: pos.avgCost
    });
  }

  function buy(symbol, name, qty, price) {
    qty = parseFloat(qty);
    price = parseFloat(price);
    if (!qty || qty <= 0 || !price || price <= 0) throw new Error("Cantidad o precio inválidos.");
    var state = load();
    execBuy(state, symbol, name, qty, price);
    save(state);
    return state;
  }

  function sell(symbol, qty, price) {
    qty = parseFloat(qty);
    price = parseFloat(price);
    if (!qty || qty <= 0) throw new Error("Cantidad a vender inválida.");
    if (!price || price <= 0) throw new Error("Precio inválido.");
    var state = load();
    execSell(state, symbol, qty, price);
    save(state);
    return state;
  }

  /**
   * Coloca una orden. type: 'market' | 'limit' | 'stop'.
   * Las de mercado se ejecutan al instante (requiere currentPrice). Las limitadas
   * y stop quedan pendientes hasta que checkPendingOrders() detecte que se cumple
   * la condición de disparo.
   */
  function placeOrder(order) {
    var symbol = order.symbol, name = order.name, side = order.side, type = order.type;
    var qty = parseFloat(order.qty);
    if (!qty || qty <= 0) throw new Error("Cantidad inválida.");

    if (type === "market") {
      var price = parseFloat(order.currentPrice);
      if (!price || price <= 0) throw new Error("No hay precio de mercado disponible para este valor.");
      var state = load();
      if (side === "buy") execBuy(state, symbol, name, qty, price);
      else execSell(state, symbol, qty, price);
      save(state);
      return { executed: true, state: state };
    }

    var triggerPrice = parseFloat(order.triggerPrice);
    if (!triggerPrice || triggerPrice <= 0) throw new Error("Introduce un precio de disparo válido.");
    if (side === "sell") {
      var st = load();
      var pos = st.positions[symbol];
      if (!pos || pos.qty < qty) throw new Error("No tienes suficiente cantidad en cartera para esta orden.");
    }

    var state2 = load();
    state2.pendingOrders.unshift({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      ts: Date.now(),
      symbol: symbol,
      name: name,
      side: side,
      type: type,
      qty: qty,
      triggerPrice: triggerPrice,
      status: "pending"
    });
    save(state2);
    return { executed: false, state: state2 };
  }

  function cancelOrder(orderId) {
    var state = load();
    state.pendingOrders = state.pendingOrders.filter(function (o) { return o.id !== orderId; });
    save(state);
    return state;
  }

  function getPendingOrders() {
    return load().pendingOrders;
  }

  /**
   * Revisa las órdenes pendientes contra los precios recibidos (pricesMap: symbol -> price)
   * y ejecuta las que cumplan su condición de disparo. Devuelve la lista de órdenes ejecutadas.
   *  - Compra limitada: se ejecuta si precio <= triggerPrice.
   *  - Venta limitada: se ejecuta si precio >= triggerPrice.
   *  - Compra stop: se ejecuta si precio >= triggerPrice (entrada en ruptura al alza).
   *  - Venta stop (stop loss): se ejecuta si precio <= triggerPrice.
   */
  function checkPendingOrders(pricesMap) {
    var state = load();
    if (!state.pendingOrders.length) return [];
    var executed = [];
    var stillPending = [];

    state.pendingOrders.forEach(function (o) {
      var price = pricesMap[o.symbol];
      if (price == null) { stillPending.push(o); return; }

      var trigger = false;
      if (o.type === "limit" && o.side === "buy") trigger = price <= o.triggerPrice;
      else if (o.type === "limit" && o.side === "sell") trigger = price >= o.triggerPrice;
      else if (o.type === "stop" && o.side === "buy") trigger = price >= o.triggerPrice;
      else if (o.type === "stop" && o.side === "sell") trigger = price <= o.triggerPrice;

      if (!trigger) { stillPending.push(o); return; }

      try {
        if (o.side === "buy") execBuy(state, o.symbol, o.name, o.qty, price);
        else execSell(state, o.symbol, o.qty, price);
        executed.push(Object.assign({}, o, { filledPrice: price }));
      } catch (e) {
        // Si ya no hay saldo/posición suficiente al momento de disparar, se cancela la orden.
        executed.push(Object.assign({}, o, { filledPrice: price, cancelled: true, reason: e.message }));
      }
    });

    state.pendingOrders = stillPending;
    save(state);
    return executed;
  }

  function getStats(pricesMap) {
    var state = load();
    pricesMap = pricesMap || {};
    var positionsValue = 0;
    var unrealizedPL = 0;
    Object.keys(state.positions).forEach(function (sym) {
      var pos = state.positions[sym];
      var price = pricesMap[sym] != null ? pricesMap[sym] : pos.avgCost;
      positionsValue += pos.qty * price;
      unrealizedPL += (price - pos.avgCost) * pos.qty;
    });
    var totalValue = state.cash + positionsValue;
    var totalPL = totalValue - state.initialBalance;
    var totalPLPercent = state.initialBalance ? (totalPL / state.initialBalance) * 100 : 0;
    var realizedPL = state.history.filter(function (h) { return h.side === "sell"; })
      .reduce(function (acc, h) { return acc + (h.realizedPL || 0); }, 0);

    return {
      cash: round2(state.cash),
      positionsValue: round2(positionsValue),
      totalValue: round2(totalValue),
      totalPL: round2(totalPL),
      totalPLPercent: round2(totalPLPercent),
      unrealizedPL: round2(unrealizedPL),
      realizedPL: round2(realizedPL),
      initialBalance: state.initialBalance
    };
  }

  function getTradeStats() {
    var state = load();
    var sells = state.history.filter(function (h) { return h.side === "sell"; });
    var wins = sells.filter(function (h) { return h.realizedPL > 0; });
    var losses = sells.filter(function (h) { return h.realizedPL <= 0; });
    var best = sells.reduce(function (a, b) { return (!a || b.realizedPL > a.realizedPL) ? b : a; }, null);
    var worst = sells.reduce(function (a, b) { return (!a || b.realizedPL < a.realizedPL) ? b : a; }, null);
    return {
      totalTrades: sells.length,
      wins: wins.length,
      losses: losses.length,
      winRate: sells.length ? round2((wins.length / sells.length) * 100) : 0,
      bestTrade: best,
      worstTrade: worst
    };
  }

  return {
    getState: getState,
    setState: setState,
    reset: reset,
    buy: buy,
    sell: sell,
    placeOrder: placeOrder,
    cancelOrder: cancelOrder,
    getPendingOrders: getPendingOrders,
    checkPendingOrders: checkPendingOrders,
    getStats: getStats,
    getTradeStats: getTradeStats,
    DEFAULT_BALANCE: DEFAULT_BALANCE
  };
}

/* Instancia por defecto: la que ya usaba la zona de Práctica (compatibilidad). */
var Portfolio = PortfolioFactory("invia_portfolio_v1", 10000);
