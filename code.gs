const SPREADSHEET_ID = '';

const SHEET_HEADERS = {
  Items: ['id', 'name', 'category', 'price', 'sku', 'barcode', 'stockQty', 'minStock', 'isActive', 'updatedAt'],
  Categories: ['categoryId', 'name', 'isActive', 'updatedAt'],
  Transactions: ['timestamp', 'total', 'detail', 'trxId', 'paymentMethod', 'itemCount', 'cashReceived', 'changeAmount', 'status'],
  TransactionItems: ['trxId', 'itemId', 'nameSnapshot', 'qty', 'price', 'subtotal'],
  InventoryMoves: ['moveId', 'createdAt', 'itemId', 'type', 'qtyDelta', 'beforeQty', 'afterQty', 'referenceId', 'note'],
  Settings: ['key', 'value']
};

const DEFAULT_SETTINGS = {
  storeName: 'Kasira POS',
  storeAddress: 'Jl. Contoh No. 1',
  storePhone: '0812-0000-0000',
  receiptFooter: 'Terima kasih sudah berbelanja.'
};

const PAYMENT_METHODS = ['cash', 'qris', 'transfer', 'ewallet'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Kasira POS Retail')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function getAppBootstrapData() {
  return executeSafely_(function () {
    const context = ensureSchema_();
    const inventory = getInventoryContext_(context);
    const dashboard = buildDashboardSummary_(context, inventory.items);
    const transactions = buildTransactionsForClient_(context, { range: 'all' });

    return buildResponse_(true, 'Data aplikasi berhasil dimuat.', {
      store: mapStoreForClient_(getStoreSettings_(context)),
      storeInfo: getStoreSettings_(context),
      categories: inventory.categories.map(mapCategoryForClient_),
      items: inventory.items.map(mapItemForClient_),
      transactions: transactions,
      dashboard: mapDashboardForClient_(dashboard)
    });
  });
}

function saveSale(payload) {
  return executeSafely_(function () {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);

    try {
      const context = ensureSchema_();
      const sale = validateSalePayload_(context, payload || {});
      const result = persistSale_(context, sale);
      return buildResponse_(true, 'Transaksi berhasil disimpan.', result);
    } finally {
      lock.releaseLock();
    }
  });
}

function saveItem(payload) {
  return executeSafely_(function () {
    const context = ensureSchema_();
    const itemsSheet = context.Items.sheet;
    const rows = readSheetObjects_(itemsSheet);
    const headers = context.Items.headers;
    const now = new Date();
    const itemId = stringValue_(payload && payload.id);
    const itemName = stringValue_(payload && payload.name);
    const categoryId = stringValue_(payload && (payload.categoryId || payload.category));
    const sku = stringValue_(payload && payload.sku);
    const barcode = stringValue_(payload && payload.barcode);
    const price = normalizeMoney_(payload && payload.price);
    const isActive = booleanValue_(payload && payload.isActive, true);

    if (!itemName) {
      throw new Error('Nama produk wajib diisi.');
    }
    let targetRow = null;
    if (itemId) {
      targetRow = rows.find(function (row) {
        return stringValue_(row.id) === itemId;
      }) || null;
    }

    const finalId = targetRow ? stringValue_(targetRow.id) : generateId_('ITEM');
    const currentStockQty = targetRow ? normalizeInteger_(targetRow.stockQty, 0) : 0;
    const currentMinStock = targetRow ? normalizeInteger_(targetRow.minStock, 0) : 0;
    const stockQty = Object.prototype.hasOwnProperty.call(payload || {}, 'stockQty')
      ? normalizeInteger_(payload && payload.stockQty, currentStockQty)
      : currentStockQty;
    const minStock = Object.prototype.hasOwnProperty.call(payload || {}, 'minStock')
      ? normalizeInteger_(payload && payload.minStock, currentMinStock)
      : currentMinStock;

    if (price < 0) {
      throw new Error('Harga produk tidak boleh negatif.');
    }
    if (stockQty < 0 || minStock < 0) {
      throw new Error('Stok dan stok minimum tidak boleh negatif.');
    }

    const rowObject = {
      id: finalId,
      name: itemName,
      category: categoryId,
      price: price,
      sku: sku,
      barcode: barcode,
      stockQty: stockQty,
      minStock: minStock,
      isActive: isActive,
      updatedAt: now
    };

    if (targetRow) {
      writeObjectToExistingRow_(itemsSheet, headers, targetRow._rowNumber, rowObject);
    } else {
      appendObjectRows_(itemsSheet, headers, [rowObject]);
    }

    const inventory = getInventoryContext_(context);
    const savedItem = inventory.items.find(function (item) {
      return item.id === finalId;
    });

    return buildResponse_(true, 'Produk berhasil disimpan.', mapItemForClient_(savedItem || rowObject));
  });
}

function saveCategory(payload) {
  return executeSafely_(function () {
    const context = ensureSchema_();
    const categoriesSheet = context.Categories.sheet;
    const rows = readSheetObjects_(categoriesSheet);
    const headers = context.Categories.headers;
    const categoryIdInput = stringValue_(payload && (payload.categoryId || payload.id));
    const name = stringValue_(payload && payload.name);
    const isActive = booleanValue_(payload && payload.isActive, true);
    const now = new Date();

    if (!name) {
      throw new Error('Nama kategori wajib diisi.');
    }

    let targetRow = null;
    if (categoryIdInput) {
      targetRow = rows.find(function (row) {
        return stringValue_(row.categoryId) === categoryIdInput;
      }) || null;
    }

    const finalId = targetRow ? stringValue_(targetRow.categoryId) : (categoryIdInput || generateId_('CAT'));
    const rowObject = {
      categoryId: finalId,
      name: name,
      isActive: isActive,
      updatedAt: now
    };

    if (targetRow) {
      writeObjectToExistingRow_(categoriesSheet, headers, targetRow._rowNumber, rowObject);
    } else {
      appendObjectRows_(categoriesSheet, headers, [rowObject]);
    }

    const inventory = getInventoryContext_(context);
    const savedCategory = inventory.categories.find(function (category) {
      return category.categoryId === finalId;
    }) || {
      categoryId: finalId,
      name: name,
      isActive: isActive
    };

    return buildResponse_(true, 'Kategori berhasil disimpan.', mapCategoryForClient_(savedCategory));
  });
}

function adjustStock(payload) {
  return executeSafely_(function () {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);

    try {
      const context = ensureSchema_();
      const inventory = getInventoryContext_(context);
      const itemsSheet = context.Items.sheet;
      const headers = context.Items.headers;
      const itemId = stringValue_(payload && payload.itemId);
      const directionRaw = stringValue_(payload && (payload.direction || payload.type)).toLowerCase();
      const direction = directionRaw === 'add' ? 'increase' : directionRaw === 'sub' ? 'decrease' : directionRaw;
      const qty = normalizeInteger_(payload && payload.qty, 0);
      const note = stringValue_(payload && payload.note);
      const item = inventory.itemIndex[itemId];

      if (!item) {
        throw new Error('Produk tidak ditemukan.');
      }
      if (qty <= 0) {
        throw new Error('Jumlah penyesuaian stok harus lebih dari 0.');
      }
      if (direction !== 'increase' && direction !== 'decrease') {
        throw new Error('Arah penyesuaian stok tidak valid.');
      }

      const beforeQty = item.stockManaged ? item.stockQty : 0;
      const delta = direction === 'increase' ? qty : (qty * -1);
      const afterQty = beforeQty + delta;
      if (afterQty < 0) {
        throw new Error('Stok tidak mencukupi untuk pengurangan.');
      }

      writeObjectToExistingRow_(itemsSheet, headers, item._rowNumber, {
        stockQty: afterQty,
        updatedAt: new Date()
      });

      appendObjectRows_(context.InventoryMoves.sheet, context.InventoryMoves.headers, [{
        moveId: generateId_('MOVE'),
        createdAt: new Date(),
        itemId: item.id,
        type: 'ADJUSTMENT',
        qtyDelta: delta,
        beforeQty: beforeQty,
        afterQty: afterQty,
        referenceId: '',
        note: note || (direction === 'increase' ? 'Tambah stok manual' : 'Kurangi stok manual')
      }]);

      const refreshedInventory = getInventoryContext_(context);
      return buildResponse_(true, 'Stok berhasil disesuaikan.', mapItemForClient_(toPublicItem_(refreshedInventory.itemIndex[itemId])));
    } finally {
      lock.releaseLock();
    }
  });
}

function getTransactions(filters) {
  return executeSafely_(function () {
    const context = ensureSchema_();
    const transactions = buildTransactionsForClient_(context, filters || {});
    return buildResponse_(true, 'Riwayat transaksi berhasil dimuat.', transactions);
  });
}

function getTransactionDetail(trxId) {
  return executeSafely_(function () {
    const context = ensureSchema_();
    const allTransactions = getTransactionsInternal_(context, { range: 'all' });
    const targetId = typeof trxId === 'object' && trxId !== null ? stringValue_(trxId.trxId) : stringValue_(trxId);
    const transaction = allTransactions.find(function (entry) {
      return entry.trxId === targetId;
    });

    if (!transaction) {
      throw new Error('Detail transaksi tidak ditemukan.');
    }

    const itemRows = readSheetObjects_(context.TransactionItems.sheet);
    const items = itemRows
      .filter(function (row) {
        return stringValue_(row.trxId) === transaction.trxId;
      })
      .map(function (row) {
        return {
          itemId: stringValue_(row.itemId),
          name: stringValue_(row.nameSnapshot),
          qty: normalizeInteger_(row.qty, 0),
          price: normalizeMoney_(row.price),
          subtotal: normalizeMoney_(row.subtotal)
        };
      });

    const detailItems = items.length > 0 ? items : parseLegacyDetail_(transaction.detail).map(function (entry) {
      return {
        itemId: '',
        name: entry.name,
        qty: entry.qty,
        price: 0,
        subtotal: 0
      };
    });

    return buildResponse_(true, 'Detail transaksi berhasil dimuat.', {
      transaction: transaction,
      items: detailItems,
      storeInfo: getStoreSettings_(context)
    });
  });
}

function getReportSummary(range) {
  return executeSafely_(function () {
    const context = ensureSchema_();
    const inventory = getInventoryContext_(context);
    const rangeValue = typeof range === 'object' && range !== null ? stringValue_(range.range) : stringValue_(range);
    const summary = buildReportSummary_(context, inventory.items, rangeValue || 'today');
    return buildResponse_(true, 'Laporan berhasil dimuat.', summary);
  });
}

function saveStoreSettings(payload) {
  return executeSafely_(function () {
    const context = ensureSchema_();
    const settingsPayload = payload || {};
    const nextSettings = {
      storeName: stringValue_(settingsPayload.storeName || settingsPayload.name) || DEFAULT_SETTINGS.storeName,
      storeAddress: stringValue_(settingsPayload.storeAddress || settingsPayload.address) || DEFAULT_SETTINGS.storeAddress,
      storePhone: stringValue_(settingsPayload.storePhone || settingsPayload.phone) || DEFAULT_SETTINGS.storePhone,
      receiptFooter: stringValue_(settingsPayload.receiptFooter || settingsPayload.footer) || DEFAULT_SETTINGS.receiptFooter
    };

    upsertSettings_(context.Settings.sheet, nextSettings);
    return buildResponse_(true, 'Pengaturan toko berhasil disimpan.', mapStoreForClient_(nextSettings));
  });
}

function executeSafely_(callback) {
  try {
    return callback();
  } catch (error) {
    return buildResponse_(false, error && error.message ? error.message : String(error), null);
  }
}

function buildResponse_(success, message, data) {
  return {
    success: success,
    message: message,
    data: data
  };
}

function ensureSchema_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const context = {};

  Object.keys(SHEET_HEADERS).forEach(function (sheetName) {
    context[sheetName] = ensureSheet_(spreadsheet, sheetName, SHEET_HEADERS[sheetName]);
  });

  ensureDefaultSettings_(context.Settings.sheet);
  return context;
}

function ensureSheet_(spreadsheet, sheetName, expectedHeaders) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const currentHeaders = getSheetHeaders_(sheet);
  if (currentHeaders.length === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    if (sheet.getFrozenRows() < 1) {
      sheet.setFrozenRows(1);
    }
    return {
      sheet: sheet,
      headers: expectedHeaders.slice()
    };
  }

  const missingHeaders = expectedHeaders.filter(function (header) {
    return currentHeaders.indexOf(header) === -1;
  });

  if (missingHeaders.length > 0) {
    const startColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, startColumn, 1, missingHeaders.length).setValues([missingHeaders]);
  }

  if (sheet.getFrozenRows() < 1) {
    sheet.setFrozenRows(1);
  }

  return {
    sheet: sheet,
    headers: getSheetHeaders_(sheet)
  };
}

function getSheetHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    return [];
  }
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
    return stringValue_(value);
  }).filter(function (value) {
    return value !== '';
  });
}

function readSheetObjects_(sheet) {
  const headers = getSheetHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (headers.length === 0 || lastRow < 2) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    .map(function (row, index) {
      const object = { _rowNumber: index + 2 };
      headers.forEach(function (header, cellIndex) {
        object[header] = row[cellIndex];
      });
      return object;
    })
    .filter(function (rowObject) {
      return headers.some(function (header) {
        return rowObject[header] !== '' && rowObject[header] !== null;
      });
    });
}

function appendObjectRows_(sheet, headers, rows) {
  if (!rows || rows.length === 0) {
    return;
  }

  const values = rows.map(function (rowObject) {
    return headers.map(function (header) {
      return Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : '';
    });
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
}

function writeObjectToExistingRow_(sheet, headers, rowNumber, partialObject) {
  const currentValues = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const nextValues = headers.map(function (header, index) {
    return Object.prototype.hasOwnProperty.call(partialObject, header) ? partialObject[header] : currentValues[index];
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([nextValues]);
}

function ensureDefaultSettings_(settingsSheet) {
  const rows = readSheetObjects_(settingsSheet);
  const existing = {};

  rows.forEach(function (row) {
    existing[stringValue_(row.key)] = row;
  });

  const missingRows = Object.keys(DEFAULT_SETTINGS).filter(function (key) {
    return !existing[key];
  }).map(function (key) {
    return {
      key: key,
      value: DEFAULT_SETTINGS[key]
    };
  });

  if (missingRows.length > 0) {
    appendObjectRows_(settingsSheet, SHEET_HEADERS.Settings, missingRows);
  }
}

function upsertSettings_(settingsSheet, settingsObject) {
  const rows = readSheetObjects_(settingsSheet);
  const rowByKey = {};
  rows.forEach(function (row) {
    rowByKey[stringValue_(row.key)] = row;
  });

  Object.keys(settingsObject).forEach(function (key) {
    const existingRow = rowByKey[key];
    if (existingRow) {
      writeObjectToExistingRow_(settingsSheet, SHEET_HEADERS.Settings, existingRow._rowNumber, {
        key: key,
        value: settingsObject[key]
      });
    } else {
      appendObjectRows_(settingsSheet, SHEET_HEADERS.Settings, [{
        key: key,
        value: settingsObject[key]
      }]);
    }
  });
}

function getStoreSettings_(context) {
  const rows = readSheetObjects_(context.Settings.sheet);
  const settings = {};

  rows.forEach(function (row) {
    settings[stringValue_(row.key)] = stringValue_(row.value);
  });

  return {
    storeName: settings.storeName || DEFAULT_SETTINGS.storeName,
    storeAddress: settings.storeAddress || DEFAULT_SETTINGS.storeAddress,
    storePhone: settings.storePhone || DEFAULT_SETTINGS.storePhone,
    receiptFooter: settings.receiptFooter || DEFAULT_SETTINGS.receiptFooter
  };
}

function getInventoryContext_(context) {
  const categoryRows = readSheetObjects_(context.Categories.sheet);
  const itemRows = readSheetObjects_(context.Items.sheet);
  const categories = buildEffectiveCategories_(categoryRows, itemRows);
  const categoryMap = {};
  const itemIndex = {};

  categories.forEach(function (category) {
    categoryMap[category.categoryId] = category;
  });

  itemRows.forEach(function (row) {
    const item = normalizeItemRecord_(row, categoryMap);
    if (item && item.id && item.name) {
      itemIndex[item.id] = item;
    }
  });

  const items = Object.keys(itemIndex).map(function (itemId) {
    return toPublicItem_(itemIndex[itemId]);
  }).sort(sortByName_);

  return {
    categories: categories,
    categoryMap: categoryMap,
    itemIndex: itemIndex,
    items: items
  };
}

function buildEffectiveCategories_(categoryRows, itemRows) {
  const map = {};

  categoryRows.forEach(function (row) {
    const category = normalizeCategoryRecord_(row);
    if (category && category.categoryId) {
      map[category.categoryId] = category;
    }
  });

  itemRows.forEach(function (row) {
    const legacyCategoryKey = stringValue_(row.category);
    if (!legacyCategoryKey || map[legacyCategoryKey]) {
      return;
    }

    map[legacyCategoryKey] = {
      categoryId: legacyCategoryKey,
      name: legacyCategoryKey,
      isActive: true,
      legacy: true,
      updatedAt: ''
    };
  });

  return Object.keys(map).map(function (key) {
    return map[key];
  }).sort(function (left, right) {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }
    return sortByName_(left, right);
  }).map(function (category) {
    return {
      categoryId: category.categoryId,
      name: category.name,
      isActive: category.isActive,
      legacy: !!category.legacy,
      updatedAt: category.updatedAt || ''
    };
  });
}

function normalizeCategoryRecord_(row) {
  const categoryId = stringValue_(row.categoryId);
  const name = stringValue_(row.name) || categoryId;

  if (!categoryId || !name) {
    return null;
  }

  return {
    _rowNumber: row._rowNumber,
    categoryId: categoryId,
    name: name,
    isActive: booleanValue_(row.isActive, true),
    legacy: false,
    updatedAt: safeIsoString_(row.updatedAt)
  };
}

function normalizeItemRecord_(row, categoryMap) {
  const itemId = stringValue_(row.id);
  const name = stringValue_(row.name);

  if (!itemId || !name) {
    return null;
  }

  const categoryId = stringValue_(row.category);
  const category = categoryMap[categoryId];
  const stockManaged = row.stockQty !== '' && row.stockQty !== null;

  return {
    _rowNumber: row._rowNumber,
    id: itemId,
    name: name,
    categoryId: categoryId,
    categoryName: category ? category.name : (categoryId || 'Tanpa kategori'),
    price: normalizeMoney_(row.price),
    sku: stringValue_(row.sku),
    barcode: stringValue_(row.barcode),
    stockQty: normalizeInteger_(row.stockQty, 0),
    stockManaged: stockManaged,
    minStock: normalizeInteger_(row.minStock, 0),
    isActive: booleanValue_(row.isActive, true),
    updatedAt: safeIsoString_(row.updatedAt)
  };
}

function toPublicItem_(item) {
  return {
    id: item.id,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    price: item.price,
    sku: item.sku,
    barcode: item.barcode,
    stockQty: item.stockQty,
    stockManaged: item.stockManaged,
    minStock: item.minStock,
    isActive: item.isActive,
    updatedAt: item.updatedAt
  };
}

function mapStoreForClient_(storeInfo) {
  const source = storeInfo || {};
  return {
    name: source.storeName || DEFAULT_SETTINGS.storeName,
    address: source.storeAddress || DEFAULT_SETTINGS.storeAddress,
    phone: source.storePhone || DEFAULT_SETTINGS.storePhone,
    footer: source.receiptFooter || DEFAULT_SETTINGS.receiptFooter,
    storeName: source.storeName || DEFAULT_SETTINGS.storeName,
    storeAddress: source.storeAddress || DEFAULT_SETTINGS.storeAddress,
    storePhone: source.storePhone || DEFAULT_SETTINGS.storePhone,
    receiptFooter: source.receiptFooter || DEFAULT_SETTINGS.receiptFooter
  };
}

function mapCategoryForClient_(category) {
  if (!category) {
    return null;
  }

  return {
    id: category.categoryId || '',
    categoryId: category.categoryId || '',
    name: category.name || '',
    isActive: booleanValue_(category.isActive, true),
    legacy: !!category.legacy,
    updatedAt: category.updatedAt || ''
  };
}

function mapItemForClient_(item) {
  if (!item) {
    return null;
  }

  return {
    id: item.id || '',
    name: item.name || '',
    categoryId: item.categoryId || '',
    categoryName: item.categoryName || '',
    price: normalizeMoney_(item.price),
    sku: item.sku || '',
    barcode: item.barcode || '',
    stockQty: normalizeInteger_(item.stockQty, 0),
    stockManaged: booleanValue_(item.stockManaged, false),
    minStock: normalizeInteger_(item.minStock, 0),
    isActive: booleanValue_(item.isActive, true),
    updatedAt: item.updatedAt || ''
  };
}

function mapDashboardForClient_(dashboard) {
  const source = dashboard || {};
  const lowStocks = (source.lowStockItems || []).map(function (item) {
    return mapItemForClient_(item);
  }).filter(function (item) {
    return item !== null;
  });

  return {
    salesToday: normalizeMoney_(source.salesToday),
    transactionsToday: normalizeInteger_(source.transactionsToday, 0),
    activeItemCount: normalizeInteger_(source.activeItemCount, 0),
    lowStockCount: normalizeInteger_(source.lowStockCount, 0),
    lowStockItems: lowStocks,
    lowStocks: lowStocks,
    recentTransactions: source.recentTransactions || [],
    trxCount: normalizeInteger_(source.transactionsToday, 0)
  };
}

function buildTransactionsForClient_(context, filters) {
  const transactions = getTransactionsInternal_(context, filters || {});
  const itemRows = readSheetObjects_(context.TransactionItems.sheet);
  const itemMap = {};

  itemRows.forEach(function (row) {
    const trxId = stringValue_(row.trxId);
    if (!trxId) {
      return;
    }
    if (!itemMap[trxId]) {
      itemMap[trxId] = [];
    }
    itemMap[trxId].push({
      itemId: stringValue_(row.itemId),
      name: stringValue_(row.nameSnapshot),
      qty: normalizeInteger_(row.qty, 0),
      price: normalizeMoney_(row.price),
      subtotal: normalizeMoney_(row.subtotal)
    });
  });

  return transactions.map(function (transaction) {
    const items = itemMap[transaction.trxId] || parseLegacyDetail_(transaction.detail).map(function (entry) {
      return {
        itemId: '',
        name: entry.name,
        qty: entry.qty,
        price: 0,
        subtotal: 0
      };
    });

    return {
      trxId: transaction.trxId,
      timestamp: transaction.timestamp,
      timestampLabel: transaction.timestampLabel,
      total: normalizeMoney_(transaction.total),
      detail: transaction.detail,
      paymentMethod: transaction.paymentMethod,
      itemCount: normalizeInteger_(transaction.itemCount, items.reduce(function (sum, item) {
        return sum + normalizeInteger_(item.qty, 0);
      }, 0)),
      cashReceived: transaction.cashReceived,
      changeAmount: transaction.changeAmount,
      status: transaction.status,
      legacy: !!transaction.legacy,
      items: items
    };
  });
}

function validateSalePayload_(context, payload) {
  const inventory = getInventoryContext_(context);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const paymentMethod = stringValue_(payload.paymentMethod).toLowerCase() || 'cash';
  const cashReceived = payload.cashReceived === '' || payload.cashReceived === null || typeof payload.cashReceived === 'undefined'
    ? ''
    : normalizeMoney_(payload.cashReceived);

  if (items.length === 0) {
    throw new Error('Keranjang masih kosong.');
  }
  if (PAYMENT_METHODS.indexOf(paymentMethod) === -1) {
    throw new Error('Metode pembayaran tidak valid.');
  }

  let total = 0;
  let itemCount = 0;

  const saleItems = items.map(function (entry) {
    const itemId = stringValue_(entry && entry.itemId);
    const qty = normalizeInteger_(entry && entry.qty, 0);
    const item = inventory.itemIndex[itemId];

    if (!item) {
      throw new Error('Ada produk pada keranjang yang tidak ditemukan.');
    }
    if (!item.isActive) {
      throw new Error('Ada produk tidak aktif pada keranjang.');
    }
    if (qty <= 0) {
      throw new Error('Jumlah item pada keranjang tidak valid.');
    }

    const beforeQty = item.stockManaged ? item.stockQty : '';
    const afterQty = item.stockManaged ? (item.stockQty - qty) : '';

    if (item.stockManaged && afterQty < 0) {
      throw new Error('Stok produk "' + item.name + '" tidak mencukupi.');
    }

    const subtotal = item.price * qty;
    total += subtotal;
    itemCount += qty;

    return {
      itemId: item.id,
      nameSnapshot: item.name,
      qty: qty,
      price: item.price,
      subtotal: subtotal,
      rowNumber: item._rowNumber,
      stockManaged: item.stockManaged,
      beforeQty: beforeQty,
      afterQty: afterQty
    };
  });

  if (paymentMethod === 'cash') {
    if (cashReceived === '' || cashReceived < total) {
      throw new Error('Nominal tunai belum cukup.');
    }
  }

  return {
    paymentMethod: paymentMethod,
    cashReceived: paymentMethod === 'cash' ? cashReceived : '',
    changeAmount: paymentMethod === 'cash' ? (cashReceived - total) : '',
    itemCount: itemCount,
    total: total,
    items: saleItems
  };
}

function persistSale_(context, sale) {
  const now = new Date();
  const trxId = generateId_('TRX');
  const detailString = sale.items.map(function (item) {
    return item.nameSnapshot + ' (x' + item.qty + ')';
  }).join(', ');
  const itemHeaders = context.Items.headers;
  const itemsSheet = context.Items.sheet;

  appendObjectRows_(context.Transactions.sheet, context.Transactions.headers, [{
    timestamp: now,
    total: sale.total,
    detail: detailString,
    trxId: trxId,
    paymentMethod: sale.paymentMethod,
    itemCount: sale.itemCount,
    cashReceived: sale.cashReceived,
    changeAmount: sale.changeAmount,
    status: 'Selesai'
  }]);

  appendObjectRows_(context.TransactionItems.sheet, context.TransactionItems.headers, sale.items.map(function (item) {
    return {
      trxId: trxId,
      itemId: item.itemId,
      nameSnapshot: item.nameSnapshot,
      qty: item.qty,
      price: item.price,
      subtotal: item.subtotal
    };
  }));

  const inventoryRows = [];
  sale.items.forEach(function (item) {
    if (item.stockManaged) {
      writeObjectToExistingRow_(itemsSheet, itemHeaders, item.rowNumber, {
        stockQty: item.afterQty,
        updatedAt: now
      });
    }

    inventoryRows.push({
      moveId: generateId_('MOVE'),
      createdAt: now,
      itemId: item.itemId,
      type: 'SALE',
      qtyDelta: item.qty * -1,
      beforeQty: item.stockManaged ? item.beforeQty : '',
      afterQty: item.stockManaged ? item.afterQty : '',
      referenceId: trxId,
      note: 'Penjualan POS'
    });
  });

  appendObjectRows_(context.InventoryMoves.sheet, context.InventoryMoves.headers, inventoryRows);
  SpreadsheetApp.flush();

  return {
    trxId: trxId,
    timestamp: safeIsoString_(now),
    total: sale.total,
    itemCount: sale.itemCount,
    paymentMethod: sale.paymentMethod,
    cashReceived: sale.cashReceived === '' ? null : sale.cashReceived,
    changeAmount: sale.changeAmount === '' ? null : sale.changeAmount,
    status: 'Selesai',
    items: sale.items.map(function (item) {
      return {
        itemId: item.itemId,
        name: item.nameSnapshot,
        qty: item.qty,
        price: item.price,
        subtotal: item.subtotal
      };
    }),
    storeInfo: getStoreSettings_(context)
  };
}

function getTransactionsInternal_(context, filters) {
  const transactions = readSheetObjects_(context.Transactions.sheet).map(function (row) {
    return normalizeTransactionRecord_(row);
  }).filter(function (row) {
    return row !== null;
  });

  return filterTransactions_(transactions, filters || {}).sort(function (left, right) {
    const leftValue = left.timestamp ? new Date(left.timestamp).getTime() : 0;
    const rightValue = right.timestamp ? new Date(right.timestamp).getTime() : 0;
    return rightValue - leftValue;
  });
}

function normalizeTransactionRecord_(row) {
  const timestamp = parseDate_(row.timestamp);
  const detail = stringValue_(row.detail);
  const legacyItems = parseLegacyDetail_(detail);
  const transactionId = stringValue_(row.trxId) || buildLegacyTransactionId_(row._rowNumber);

  return {
    trxId: transactionId,
    timestamp: safeIsoString_(timestamp),
    timestampLabel: formatReadableDate_(timestamp),
    total: normalizeMoney_(row.total),
    detail: detail,
    paymentMethod: stringValue_(row.paymentMethod).toLowerCase() || 'legacy',
    itemCount: row.itemCount !== '' && row.itemCount !== null
      ? normalizeInteger_(row.itemCount, 0)
      : legacyItems.reduce(function (sum, item) { return sum + item.qty; }, 0),
    cashReceived: row.cashReceived === '' || row.cashReceived === null ? null : normalizeMoney_(row.cashReceived),
    changeAmount: row.changeAmount === '' || row.changeAmount === null ? null : normalizeMoney_(row.changeAmount),
    status: stringValue_(row.status) || 'Selesai',
    legacy: stringValue_(row.trxId) === ''
  };
}

function filterTransactions_(transactions, filters) {
  const range = stringValue_(filters.range) || 'all';
  const search = stringValue_(filters.search).toLowerCase();

  return transactions.filter(function (transaction) {
    const timestamp = parseDate_(transaction.timestamp);
    const matchesRange = isWithinRange_(timestamp, range);
    const haystack = [
      transaction.trxId,
      transaction.detail,
      transaction.paymentMethod,
      transaction.status
    ].join(' ').toLowerCase();
    const matchesSearch = !search || haystack.indexOf(search) !== -1;
    return matchesRange && matchesSearch;
  });
}

function buildDashboardSummary_(context, items) {
  const todaysTransactions = getTransactionsInternal_(context, { range: 'today' });
  const salesToday = todaysTransactions.reduce(function (sum, transaction) {
    return sum + normalizeMoney_(transaction.total);
  }, 0);
  const lowStockItems = items.filter(function (item) {
    return item.stockManaged && item.stockQty <= item.minStock;
  });

  return {
    salesToday: salesToday,
    transactionsToday: todaysTransactions.length,
    lowStockCount: lowStockItems.length,
    activeItemCount: items.filter(function (item) { return item.isActive; }).length,
    lowStockItems: lowStockItems.slice(0, 5),
    recentTransactions: todaysTransactions.slice(0, 5)
  };
}

function buildReportSummary_(context, items, range) {
  const transactions = getTransactionsInternal_(context, { range: range || 'today' });
  const transactionItems = readSheetObjects_(context.TransactionItems.sheet);
  const transactionIdMap = {};
  const topProductMap = {};
  const paymentBreakdown = {
    cash: 0,
    qris: 0,
    transfer: 0,
    ewallet: 0,
    legacy: 0
  };

  transactions.forEach(function (transaction) {
    transactionIdMap[transaction.trxId] = transaction;
    if (!paymentBreakdown.hasOwnProperty(transaction.paymentMethod)) {
      paymentBreakdown[transaction.paymentMethod] = 0;
    }
    paymentBreakdown[transaction.paymentMethod] += transaction.total;
  });

  transactionItems.forEach(function (row) {
    const trxId = stringValue_(row.trxId);
    if (!transactionIdMap[trxId]) {
      return;
    }

    const name = stringValue_(row.nameSnapshot);
    const qty = normalizeInteger_(row.qty, 0);
    const subtotal = normalizeMoney_(row.subtotal);

    if (!topProductMap[name]) {
      topProductMap[name] = {
        name: name,
        qty: 0,
        revenue: 0
      };
    }

    topProductMap[name].qty += qty;
    topProductMap[name].revenue += subtotal;
  });

  transactions.forEach(function (transaction) {
    if (transaction.legacy) {
      parseLegacyDetail_(transaction.detail).forEach(function (entry) {
        if (!topProductMap[entry.name]) {
          topProductMap[entry.name] = {
            name: entry.name,
            qty: 0,
            revenue: 0
          };
        }
        topProductMap[entry.name].qty += entry.qty;
      });
    }
  });

  const totalRevenue = transactions.reduce(function (sum, transaction) {
    return sum + transaction.total;
  }, 0);

  return {
    range: range || 'today',
    totalRevenue: totalRevenue,
    totalTransactions: transactions.length,
    averageBasket: transactions.length > 0 ? Math.round(totalRevenue / transactions.length) : 0,
    paymentBreakdown: paymentBreakdown,
    topProducts: Object.keys(topProductMap).map(function (key) {
      return topProductMap[key];
    }).sort(function (left, right) {
      if (left.qty !== right.qty) {
        return right.qty - left.qty;
      }
      return right.revenue - left.revenue;
    }).slice(0, 5),
    lowStockItems: items.filter(function (item) {
      return item.stockManaged && item.stockQty <= item.minStock;
    }).slice(0, 10)
  };
}

function parseLegacyDetail_(detailString) {
  const detail = stringValue_(detailString);
  if (!detail) {
    return [];
  }

  return detail.split(/\s*,\s*/).map(function (entry) {
    const match = entry.match(/^(.*)\s+\(x(\d+)\)$/i);
    if (!match) {
      return {
        name: entry,
        qty: 1
      };
    }

    return {
      name: stringValue_(match[1]),
      qty: normalizeInteger_(match[2], 1)
    };
  }).filter(function (entry) {
    return entry.name !== '';
  });
}

function isWithinRange_(date, range) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return range === 'all';
  }

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const rangeKey = stringValue_(range) || 'all';

  if (rangeKey === 'today') {
    return date.getTime() >= startToday.getTime();
  }
  if (rangeKey === '7d') {
    return date.getTime() >= (now.getTime() - (7 * 24 * 60 * 60 * 1000));
  }
  if (rangeKey === '30d') {
    return date.getTime() >= (now.getTime() - (30 * 24 * 60 * 60 * 1000));
  }
  return true;
}

function parseDate_(value) {
  if (!value && value !== 0) {
    return null;
  }
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function safeIsoString_(value) {
  const date = parseDate_(value);
  return date ? date.toISOString() : '';
}

function formatReadableDate_(value) {
  const date = parseDate_(value);
  if (!date) {
    return '-';
  }

  const timezone = Session.getScriptTimeZone() || 'Asia/Jakarta';
  return Utilities.formatDate(date, timezone, 'dd MMM yyyy HH:mm');
}

function buildLegacyTransactionId_(rowNumber) {
  return 'LEGACY-' + rowNumber;
}

function generateId_(prefix) {
  return [
    prefix,
    Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyyMMddHHmmss'),
    Utilities.getUuid().slice(0, 6).toUpperCase()
  ].join('-');
}

function stringValue_(value) {
  if (value === null || typeof value === 'undefined') {
    return '';
  }
  return String(value).trim();
}

function normalizeMoney_(value) {
  if (value === null || value === '' || typeof value === 'undefined') {
    return 0;
  }
  const numeric = Number(value);
  if (isNaN(numeric)) {
    return 0;
  }
  return Math.round(numeric);
}

function normalizeInteger_(value, fallback) {
  if (value === null || value === '' || typeof value === 'undefined') {
    return typeof fallback === 'number' ? fallback : 0;
  }
  const numeric = Number(value);
  if (isNaN(numeric)) {
    return typeof fallback === 'number' ? fallback : 0;
  }
  return Math.round(numeric);
}

function booleanValue_(value, fallback) {
  if (value === null || value === '' || typeof value === 'undefined') {
    return !!fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (['true', '1', 'yes', 'y'].indexOf(normalized) !== -1) {
    return true;
  }
  if (['false', '0', 'no', 'n'].indexOf(normalized) !== -1) {
    return false;
  }
  return !!fallback;
}

function sortByName_(left, right) {
  const leftName = (left.name || '').toLowerCase();
  const rightName = (right.name || '').toLowerCase();
  if (leftName < rightName) {
    return -1;
  }
  if (leftName > rightName) {
    return 1;
  }
  return 0;
}
