var KasiraModules = KasiraModules || {};

KasiraModules.MidtransGateway = (function () {
  var ENVIRONMENTS = {
    sandbox: {
      snapBaseUrl: 'https://app.sandbox.midtrans.com',
      apiBaseUrl: 'https://api.sandbox.midtrans.com'
    },
    production: {
      snapBaseUrl: 'https://app.midtrans.com',
      apiBaseUrl: 'https://api.midtrans.com'
    }
  };

  var PENDING_STATUSES = {
    pending: true,
    authorize: true
  };

  var FAILURE_STATUSES = {
    deny: true,
    cancel: true,
    expire: true,
    failure: true
  };

  function getPublicConfig() {
    var config = getConfig_();
    return {
      enabled: !!config.serverKey,
      mode: config.mode,
      merchantId: config.merchantId,
      clientKey: config.clientKey,
      clientKeyConfigured: !!config.clientKey,
      serverKeyConfigured: !!config.serverKey
    };
  }

  function getAdminConfig() {
    var config = getConfig_();
    return {
      enabled: !!config.serverKey,
      mode: config.mode,
      merchantId: config.merchantId,
      clientKey: config.clientKey,
      clientKeyConfigured: !!config.clientKey,
      serverKeyConfigured: !!config.serverKey
    };
  }

  function saveAdminConfig(payload) {
    var input = payload || {};
    var props = PropertiesService.getScriptProperties();
    var current = getConfig_();
    var hasMode = Object.prototype.hasOwnProperty.call(input, 'mode');
    var modeInput = hasMode ? toText_(input.mode).toLowerCase() : current.mode;
    var mode = modeInput === 'production' ? 'production' : 'sandbox';
    var merchantId = toText_(input.merchantId);
    var clientKey = toText_(input.clientKey);
    var serverKey = toText_(input.serverKey);
    var hasMerchantId = Object.prototype.hasOwnProperty.call(input, 'merchantId');
    var hasClientKey = Object.prototype.hasOwnProperty.call(input, 'clientKey');
    var hasServerKey = Object.prototype.hasOwnProperty.call(input, 'serverKey');
    var clearServerKey = !!input.clearServerKey;

    if (hasMode) {
      props.setProperty('MIDTRANS_MODE', mode);
      props.setProperty('MIDTRANS_IS_PRODUCTION', mode === 'production' ? 'true' : 'false');
    }

    if (hasMerchantId) {
      if (merchantId) {
        props.setProperty('MIDTRANS_MERCHANT_ID', merchantId);
      } else {
        props.deleteProperty('MIDTRANS_MERCHANT_ID');
      }
    }

    if (hasClientKey) {
      if (clientKey) {
        props.setProperty('MIDTRANS_CLIENT_KEY', clientKey);
      } else {
        props.deleteProperty('MIDTRANS_CLIENT_KEY');
      }
    }

    if (clearServerKey) {
      props.deleteProperty('MIDTRANS_SERVER_KEY');
    } else if (hasServerKey && serverKey) {
      props.setProperty('MIDTRANS_SERVER_KEY', serverKey);
    }

    return getAdminConfig();
  }

  function createSnapTransaction(payload) {
    var config = requireConfig_();
    var requestBody = payload || {};
    var endpoint = ENVIRONMENTS[config.mode].snapBaseUrl + '/snap/v1/transactions';
    var response = fetchJson_(endpoint, {
      method: 'post',
      payload: JSON.stringify(requestBody),
      headers: buildHeaders_(config.serverKey)
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(extractErrorMessage_(response.body, 'Gagal membuat transaksi Midtrans.'));
    }

    if (!response.body || !response.body.token || !response.body.redirect_url) {
      throw new Error('Respons Midtrans tidak lengkap (token/redirect_url kosong).');
    }

    return {
      token: toText_(response.body.token),
      redirectUrl: toText_(response.body.redirect_url),
      raw: response.body
    };
  }

  function getTransactionStatus(orderId) {
    var config = requireConfig_();
    var targetOrderId = toText_(orderId);
    if (!targetOrderId) {
      throw new Error('Order ID Midtrans wajib diisi.');
    }

    var endpoint = ENVIRONMENTS[config.mode].apiBaseUrl + '/v2/' + encodeURIComponent(targetOrderId) + '/status';
    var response = fetchJson_(endpoint, {
      method: 'get',
      headers: buildHeaders_(config.serverKey)
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(extractErrorMessage_(response.body, 'Gagal mengambil status Midtrans.'));
    }

    return response.body || {};
  }

  function mapTransactionState(transactionStatus, fraudStatus) {
    var normalizedStatus = toText_(transactionStatus).toLowerCase();
    var normalizedFraud = toText_(fraudStatus).toLowerCase();

    if (normalizedStatus === 'capture' && normalizedFraud === 'challenge') {
      return {
        localStatus: 'Review Fraud',
        isPaid: false,
        isPending: true,
        isFailure: false
      };
    }

    if (normalizedStatus === 'settlement' || normalizedStatus === 'capture') {
      return {
        localStatus: 'Selesai',
        isPaid: true,
        isPending: false,
        isFailure: false
      };
    }

    if (normalizedStatus === 'partial_refund') {
      return {
        localStatus: 'Refund Sebagian',
        isPaid: true,
        isPending: false,
        isFailure: false
      };
    }

    if (normalizedStatus === 'refund') {
      return {
        localStatus: 'Refund',
        isPaid: true,
        isPending: false,
        isFailure: false
      };
    }

    if (PENDING_STATUSES[normalizedStatus]) {
      return {
        localStatus: 'Menunggu Pembayaran',
        isPaid: false,
        isPending: true,
        isFailure: false
      };
    }

    if (normalizedStatus === 'deny') {
      return {
        localStatus: 'Ditolak',
        isPaid: false,
        isPending: false,
        isFailure: true
      };
    }

    if (normalizedStatus === 'cancel') {
      return {
        localStatus: 'Dibatalkan',
        isPaid: false,
        isPending: false,
        isFailure: true
      };
    }

    if (normalizedStatus === 'expire') {
      return {
        localStatus: 'Kadaluarsa',
        isPaid: false,
        isPending: false,
        isFailure: true
      };
    }

    if (normalizedStatus === 'failure') {
      return {
        localStatus: 'Gagal',
        isPaid: false,
        isPending: false,
        isFailure: true
      };
    }

    return {
      localStatus: normalizedStatus ? normalizedStatus.toUpperCase() : 'Tidak Diketahui',
      isPaid: false,
      isPending: false,
      isFailure: false
    };
  }

  function isTerminalFailureStatus(transactionStatus) {
    var normalizedStatus = toText_(transactionStatus).toLowerCase();
    return !!FAILURE_STATUSES[normalizedStatus];
  }

  function getConfig_() {
    var props = PropertiesService.getScriptProperties();
    var mode = resolveMode_(props);
    return {
      mode: mode,
      serverKey: toText_(props.getProperty('MIDTRANS_SERVER_KEY')),
      clientKey: toText_(props.getProperty('MIDTRANS_CLIENT_KEY')),
      merchantId: toText_(props.getProperty('MIDTRANS_MERCHANT_ID'))
    };
  }

  function requireConfig_() {
    var config = getConfig_();
    if (!config.serverKey) {
      throw new Error('MIDTRANS_SERVER_KEY belum di-set di Script Properties.');
    }
    return config;
  }

  function resolveMode_(props) {
    var explicitMode = toText_(props.getProperty('MIDTRANS_MODE')).toLowerCase();
    var isProduction = toText_(props.getProperty('MIDTRANS_IS_PRODUCTION')).toLowerCase();
    if (isProduction === '1' || isProduction === 'true') {
      return 'production';
    }
    if (explicitMode === 'production') {
      return 'production';
    }
    return 'sandbox';
  }

  function buildHeaders_(serverKey) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Utilities.base64Encode(serverKey + ':')
    };
  }

  function fetchJson_(url, options) {
    var requestOptions = {
      method: options.method,
      headers: options.headers || {},
      muteHttpExceptions: true
    };

    if (typeof options.payload !== 'undefined' && options.payload !== null) {
      requestOptions.payload = options.payload;
    }

    var response = UrlFetchApp.fetch(url, requestOptions);
    var bodyText = response.getContentText() || '';
    return {
      statusCode: response.getResponseCode(),
      body: tryParseJson_(bodyText)
    };
  }

  function tryParseJson_(value) {
    var text = toText_(value);
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return {
        raw: text
      };
    }
  }

  function extractErrorMessage_(payload, fallback) {
    var body = payload || {};
    if (Array.isArray(body.error_messages) && body.error_messages.length > 0) {
      return body.error_messages.join(' | ');
    }
    if (body.status_message) {
      return toText_(body.status_message);
    }
    if (body.message) {
      return toText_(body.message);
    }
    if (body.error_message) {
      return toText_(body.error_message);
    }
    return fallback;
  }

  function toText_(value) {
    if (value === null || typeof value === 'undefined') {
      return '';
    }
    return String(value).trim();
  }

  return {
    getPublicConfig: getPublicConfig,
    getAdminConfig: getAdminConfig,
    saveAdminConfig: saveAdminConfig,
    createSnapTransaction: createSnapTransaction,
    getTransactionStatus: getTransactionStatus,
    mapTransactionState: mapTransactionState,
    isTerminalFailureStatus: isTerminalFailureStatus
  };
})();
