// Sabit değişkenler - new-analize.js sistemi için güncellenmiş
const STORAGE_KEY_PREFIX = 'cryptoAnalysis';
const UPDATE_INTERVAL = 120000; // 120 saniye (2 dakika)
const CANDLE_COUNT = 72; // 3 dakikalık 72 mum (new-analize.js'den)
const CANDLE_INTERVAL = '3m'; // 3 dakikalık interval
const NO_SIGNAL_RETRY_INTERVAL = 10000; // Sinyal yoksa 10 saniye sonra tekrar dene

// new-analize.js sistemi sabitleri
const CONFIDENCE_THRESHOLD = 40; // Minimum %40 confidence gerekli (daha esnek)
const MIN_SIGNAL_COUNT = 2; // Minimum 2 sinyal gerekli
const MIN_SCORE_THRESHOLD = 2; // Minimum skor eşiği (eski sistem için)
const TAKE_PROFIT_PERCENT = 0.0020; // %0.20 take profit
const ANALYSIS_UPDATE_INTERVAL = 180000; // 3 dakikada bir analiz güncelle

// Əlavə indikator parametrləri
const ADX_PERIOD = 14; // ADX periodu
const ADX_THRESHOLD = 25; // ADX minimum trend gücü həddi
const MACD_FAST = 12; // MACD fast period
const MACD_SLOW = 26; // MACD slow period
const MACD_SIGNAL = 9; // MACD signal period

// Breakout Strategy parametrləri
const BREAKOUT_LOOKBACK_PERIOD = 20; // Support/Resistance hesablanması üçün şam sayı
const BREAKOUT_THRESHOLD = 0.15; // Breakout % həddi (qırılma üçün)
const BREAKOUT_CONFIRMATION_CANDLES = 2; // Qırılma təsdiqi üçün şam sayı

// Parabolic SAR parametrləri
const SAR_ACCELERATION = 0.02; // SAR sürətlənmə faktoru
const SAR_MAXIMUM = 0.2; // SAR maksimum sürətlənmə
const SAR_AF_INCREMENT = 0.02; // SAR sürətlənmə artımı

// Candlestick Pattern parametrləri
const PATTERN_STRENGTH_THRESHOLD = 0.7; // Pattern gücü həddi (0-1 arası)

// İzleme limitleri
const LIMITS = {
  '30': { key: STORAGE_KEY_PREFIX + '30', tableBodyId: 'analysisTableBody30' }
};

// Siqnal loq jurnal adı
const SIGNAL_LOG_FILE = 'signal_log.json';

// Global değişkenler
let activeWatchers = {}; // Aktif izleyicileri saklamak için
let latestCandles = {}; // Son alınan mumları saklamak için
let latestFiveMinCandles = {}; // 5 dəqiqəlik mumları saxlamaq üçün
let autoMode = false;  // Otomatik mod durumu
let noSignalTimers = {}; // Sinyal yoksa tekrar deneme zamanlayıcıları
let activeAnalysisFlags = {}; // Aktif analizleri takip etmek için
let consecutiveSignals = {}; // Ardıcıl siqnalları saxlamaq üçün
let noSignalCounters = {}; // Sinyal olmayan sayısını izləmək üçün
let signalLog = []; // Siqnal jurnalı

// DOM elementleri
const symbolSelect = document.getElementById('symbol');
const startAnalysisBtn = document.getElementById('startAnalysisBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const statusContainer = document.getElementById('statusContainer');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const autoModeBtn = document.getElementById('autoModeBtn'); // Otomatik mod butonu
const showStatsBtn = document.getElementById('showStatsBtn');

// Sekme değiştirme
tabButtons.forEach(button => {
  button.addEventListener('click', () => {
    // Aktif sekme butonunu değiştir
    tabButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    
    // Aktif içeriği değiştir
    const tabId = button.getAttribute('data-tab');
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === tabId) {
        content.classList.add('active');
      }
    });
  });
});

// İstatistik fonksiyonları
function updateTableStats(limit) {
  const tableBodyId = LIMITS[limit].tableBodyId;
  const tableBody = document.getElementById(tableBodyId);
  const statsId = `stats${limit}`;
  const statsContainer = document.getElementById(statsId);
  
  if (!statsContainer) return;
  
  // Sonuçları say
  const rows = tableBody.querySelectorAll('tr');
  let tpCount = 0;
  let slCount = 0;
  let noSignalCount = 0;
  let activeCount = 0;
  
  // Ardıcıl SL-ləri hesablamaq üçün
  let consecutiveSL = 0;
  let maxConsecutiveSL = 0;
  let lastResults = [];
  
  // Sıralı tarixə görə sıralama
  const sortedRows = Array.from(rows).sort((a, b) => {
    const timeA = parseInt(a.getAttribute('data-time') || '0');
    const timeB = parseInt(b.getAttribute('data-time') || '0');
    return timeA - timeB;
  });
  
  sortedRows.forEach(row => {
    const result = row.getAttribute('data-result');
    const signal = row.getAttribute('data-signal');
    const isActive = row.getAttribute('data-active') === 'true';
    
    if (result === 'TP') {
      tpCount++;
      lastResults.push('TP');
      consecutiveSL = 0; // SL sayğacını sıfırla
    }
    else if (result === 'SL') {
      slCount++;
      lastResults.push('SL');
      consecutiveSL++; // Ardıcıl SL-i artır
      
      // Maksimum ardıcıl SL sayını yenilə
      if (consecutiveSL > maxConsecutiveSL) {
        maxConsecutiveSL = consecutiveSL;
      }
    }
    else if (signal === 'SİNYAL YOK') {
      noSignalCount++;
    }
    
    if (isActive) {
      activeCount++;
    }
  });
  
  // Son 5 nəticə üçün cari ardıcıl SL-ləri hesabla
  let currentConsecutiveSL = 0;
  for (let i = lastResults.length - 1; i >= 0 && i >= lastResults.length - 5; i--) {
    if (lastResults[i] === 'SL') {
      currentConsecutiveSL++;
    } else {
      break;
    }
  }
  
  // Win rate'i hesabla
  const totalResults = tpCount + slCount;
  const winRate = totalResults > 0 ? ((tpCount / totalResults) * 100).toFixed(2) : 0;
  const lossRate = totalResults > 0 ? ((slCount / totalResults) * 100).toFixed(2) : 0;
  
  // İstatistikleri güncelle
  statsContainer.innerHTML = `
    <div class="stat-item">
      <i class="fas fa-check-circle"></i>
      <span>TP: ${tpCount}</span>
    </div>
    <div class="stat-item">
      <i class="fas fa-times-circle"></i>
      <span>SL: ${slCount}</span>
    </div>
    <div class="stat-item">
      <i class="fas fa-ban"></i>
      <span>Sinyal Yok: ${noSignalCount}</span>
    </div>
    <div class="stat-item">
      <i class="fas fa-play-circle"></i>
      <span>Aktif: ${activeCount}</span>
    </div>
    <div class="stat-item win-rate">
      <i class="fas fa-trophy"></i>
      <span>Win: ${winRate}%</span>
    </div>
    <div class="stat-item loss-rate">
      <i class="fas fa-skull-crossbones"></i>
      <span>Loss: ${lossRate}%</span>
    </div>
    <div class="stat-item streak-sl ${currentConsecutiveSL >= 2 ? 'warning' : ''}">
      <i class="fas fa-bolt"></i>
      <span>Cari Ardıcıl SL: ${currentConsecutiveSL}</span>
    </div>
    <div class="stat-item max-streak-sl">
      <i class="fas fa-exclamation-triangle"></i>
      <span>Max Ardıcıl SL: ${maxConsecutiveSL}</span>
    </div>
  `;
  
  // Otomatik modda kontrol et
  checkAutoMode();
  
  return { tpCount, slCount, noSignalCount, activeCount, winRate, lossRate, currentConsecutiveSL, maxConsecutiveSL };
}

// Otomatik mod kontrolü
function checkAutoMode() {
  if (!autoMode) return;
  
  // Tüm tabloları kontrol et
  let allCompleted = true;
  
  for (const limit in LIMITS) {
    const tableBodyId = LIMITS[limit].tableBodyId;
    const tableBody = document.getElementById(tableBodyId);
    const rows = tableBody.querySelectorAll('tr');
    
    // Hiç satır yoksa devam et
    if (rows.length === 0) {
      continue;
    }
    
    // Aktif işlem var mı kontrol et
    let hasActive = false;
    rows.forEach(row => {
      const isActive = row.getAttribute('data-active') === 'true';
      if (isActive) {
        hasActive = true;
      }
    });
    
    if (hasActive) {
      allCompleted = false;
      break;
    }
  }
  
  // Tüm işlemler tamamlanmış veya iptal edilmişse yeni analiz başlat
  if (allCompleted) {
    updateStatus('Otomatik mod: Tüm işlemler tamamlandı. Yeni analiz başlatılıyor...');
    
    // 2 saniye bekleyip yeni analiz başlat
    setTimeout(() => {
      startAllAnalyses();
    }, 2000);
  }
}

// Otomatik modu aç/kapat
function toggleAutoMode() {
  autoMode = !autoMode;
  
  if (autoMode) {
    autoModeBtn.classList.add('active');
    autoModeBtn.innerHTML = '<i class="fas fa-robot"></i> Otomatik Mod: AÇIK';
    updateStatus('Otomatik mod açıldı. İşlemler tamamlandığında otomatik olarak yeni analiz başlatılacak.');
    
    // Hemen kontrol et
    checkAutoMode();
  } else {
    autoModeBtn.classList.remove('active');
    autoModeBtn.innerHTML = '<i class="fas fa-robot"></i> Otomatik Mod: KAPALI';
    updateStatus('Otomatik mod kapatıldı.');
  }
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
  // DOM elementleri
  const symbolSelect = document.getElementById('symbol');
  const startAnalysisBtn = document.getElementById('startAnalysisBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const statusContainer = document.getElementById('statusContainer');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const autoModeBtn = document.getElementById('autoModeBtn'); // Otomatik mod butonu
  const showStatsBtn = document.getElementById('showStatsBtn');

  // İlk inisializasiya və hadisə dinləyiciləri
  initializeEventListeners();
  
  // localStorage'dan verileri yükle
  loadFromStorage();
  
  // Balans gösterimini başlat
  updateBalanceDisplay();
  
  // Aktif işlemleri yeniden izlemeye başla
  restartActiveWatchers();
  
  // Tüm tablo istatistiklerini güncelle
  for (const limit in LIMITS) {
    updateTableStats(limit);
  }
  
  // Siqnal jurnalını yüklə
  try {
    const savedLog = localStorage.getItem(SIGNAL_LOG_FILE);
    if (savedLog) {
      signalLog = JSON.parse(savedLog);
    }
  } catch (error) {
    console.error('Siqnal jurnalını yükləyərkən xəta:', error);
  }

  // Hadisə dinləyicilərini inisializasiya et
  function initializeEventListeners() {
    // Sekme değiştirme
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Aktif sekme butonunu değiştir
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Aktif içeriği değiştir
        const tabId = button.getAttribute('data-tab');
        tabContents.forEach(content => {
          content.classList.remove('active');
          if (content.id === tabId) {
            content.classList.add('active');
          }
        });
      });
    });

    // Analiz başlatma butonu
    startAnalysisBtn.addEventListener('click', () => {
      startAllAnalyses();
    });

    // Tümünü temizleme butonu
    clearAllBtn.addEventListener('click', () => {
      clearAllAnalyses();
    });

    // Otomatik mod butonu
    if (autoModeBtn) {
      autoModeBtn.addEventListener('click', () => {
        toggleAutoMode();
      });
    }

    // Statistika butonu
    if (showStatsBtn) {
      showStatsBtn.addEventListener('click', () => {
        showSignalStatistics();
      });
    }
    
    // Ana panel balance management buttons
    const resetBalanceBtnMain = document.getElementById('resetBalanceBtnMain');
    const resetMartingaleBtnMain = document.getElementById('resetMartingaleBtnMain');
    
    if (resetBalanceBtnMain) {
      resetBalanceBtnMain.addEventListener('click', () => {
        if (confirm('Balansı 300 USDT\'ye sıfırlamak istediğinizden emin misiniz?')) {
          resetBalance();
        }
      });
    }
    
    if (resetMartingaleBtnMain) {
      resetMartingaleBtnMain.addEventListener('click', () => {
        if (confirm('Martingale seviyesini sıfırlamak istediğinizden emin misiniz?')) {
          resetMartingaleLevel();
        }
      });
    }

    // Sidebar balance management buttons (eski paneldeki butonlar)
    const resetBalanceBtn = document.getElementById('resetBalanceBtn');
    const resetMartingaleBtn = document.getElementById('resetMartingaleBtn');
    
    if (resetBalanceBtn) {
      resetBalanceBtn.addEventListener('click', () => {
        if (confirm('Balansı 300 USDT\'ye sıfırlamak istediğinizden emin misiniz?')) {
          resetBalance();
        }
      });
    }
    
    if (resetMartingaleBtn) {
      resetMartingaleBtn.addEventListener('click', () => {
        if (confirm('Martingale seviyesini sıfırlamak istediğinizden emin misiniz?')) {
          resetMartingaleLevel();
        }
      });
    }
  }
});

// localStorage'dan verileri yükle
function loadFromStorage() {
  // Her limit için verileri yükle
  for (const limit in LIMITS) {
    const key = LIMITS[limit].key;
    const tableBodyId = LIMITS[limit].tableBodyId;
    
    try {
    const savedData = localStorage.getItem(key);
    if (savedData) {
      const analyses = JSON.parse(savedData);
      
      // Tabloyu temizle ve yeniden oluştur
      document.getElementById(tableBodyId).innerHTML = '';
        
        // Əgər analiz massiv deyilsə və ya boş massivsə, heç nə etmə
        if (!Array.isArray(analyses) || analyses.length === 0) continue;
      
      analyses.forEach(analysis => {
          // Zəruri dəyərlərin varlığını yoxla
          if (!analysis || !analysis.symbol) return;
          
        addAnalysisToTable(analysis, limit);
      });
      }
    } catch (error) {
      console.error(`${limit} üçün verilənlər yüklənərkən xəta:`, error);
      // Problemli localStorage məlumatlarını təmizlə
      localStorage.removeItem(key);
    }
  }
  
  updateStatus('Kaydedilmiş işlemler yüklendi.');
}

// localStorage'a verileri kaydet
function saveToStorage(limit) {
  try {
    const tableBodyId = LIMITS[limit].tableBodyId;
    const analyses = getAnalysesFromTable(tableBodyId);
    localStorage.setItem(LIMITS[limit].key, JSON.stringify(analyses));
    
    // Signal jurnalını da saxla
    localStorage.setItem(SIGNAL_LOG_FILE, JSON.stringify(signalLog));
  } catch (error) {
    console.error('localStorage kaydetme hatası:', error);
  }
}

// Tablodan analiz verilerini al
function getAnalysesFromTable(tableBodyId) {
  const rows = document.getElementById(tableBodyId).querySelectorAll('tr');
  const analyses = [];
  
  rows.forEach(row => {
    // Təhlükəsiz şəkildə attribute əldə et
    const getAttribute = (attr, defaultValue) => {
      const val = row.getAttribute(attr);
      if (attr === 'data-entry-price' || attr === 'data-current-price' || 
          attr === 'data-tp' || attr === 'data-sl') {
        const parsed = parseFloat(val);
        return !isNaN(parsed) ? parsed : defaultValue;
      }
      if (attr === 'data-start-time') {
        const parsed = parseInt(val);
        return !isNaN(parsed) ? parsed : defaultValue;
      }
      if (attr === 'data-active') {
        return val === 'true';
      }
      return val || defaultValue;
    };
    
    const analysis = {
      id: getAttribute('data-id', Date.now().toString()),
      symbol: getAttribute('data-symbol', 'UNKNOWN'),
      signal: getAttribute('data-signal', 'SİNYAL YOK'),
      entryPrice: getAttribute('data-entry-price', 0),
      currentPrice: getAttribute('data-current-price', 0),
      takeProfit: getAttribute('data-tp', 0),
      stopLoss: getAttribute('data-sl', 0),
      result: getAttribute('data-result', 'SİNYAL YOK'),
      startTime: getAttribute('data-start-time', Date.now()),
      isActive: getAttribute('data-active', false)
    };
    
    analyses.push(analysis);
  });
  
  return analyses;
}

// Bitget API'sinden veriyi al
function getBitgetData(symbol, interval, limit, callback) {
  // Production'da Vercel API'sini kullan
  if (window.location.hostname.includes('vercel.app') || window.location.hostname === 'localhost') {
    const apiUrl = `/api/analyze?symbol=${symbol}`;
    
    fetch(apiUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!data.success) {
          throw new Error(`API error: ${data.error}`);
        }
        
        console.log("Vercel API Response:", data);
        
        // Vercel API'den gelen analiz sonucunu kullan
        // Dummy candle data oluştur (analiz zaten yapılmış)
        const dummyCandles = Array.from({length: limit}, (_, i) => [
          Date.now() - (limit - i) * 180000, // 3 dakikalık interval
          data.analysis.price || 50000, // open
          data.analysis.price || 50000, // high  
          data.analysis.price || 50000, // low
          data.analysis.price || 50000, // close
          1000, // volume
          Date.now() - (limit - i - 1) * 180000, // closeTime
          1000, // quoteAssetVolume
          "0", // trades
          "0", // takerBuyBaseAssetVolume
          "0"  // takerBuyQuoteAssetVolume
        ]);
        
        // Global analiz sonucunu sakla
        window.vercelAnalysisResult = data.analysis;
        
        callback(dummyCandles);
      })
      .catch(error => {
        console.error('Vercel API Error:', error);
        // Fallback olarak direkt Bitget API'yi dene
        fallbackToBitgetAPI(symbol, interval, limit, callback);
      });
  } else {
    // Development'da direkt Bitget API'yi kullan
    fallbackToBitgetAPI(symbol, interval, limit, callback);
  }
}

// Fallback Bitget API fonksiyonu
function fallbackToBitgetAPI(symbol, interval, limit, callback) {
  const xhr = new XMLHttpRequest();
  // Bitget interval formatını dönüştür
  const bitgetInterval = interval === '1m' ? '1m' : interval === '3m' ? '3m' : interval === '5m' ? '5m' : '1m';
  const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&productType=USDT-FUTURES&granularity=${bitgetInterval}&limit=${limit}`;

  xhr.open("GET", url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      try {
        const response = JSON.parse(xhr.responseText);
        console.log("Bitget API Response:", response); // Veri kontrolü
        
        if (response && response.code === '00000' && response.data && Array.isArray(response.data)) {
          // Bitget formatını Binance formatına dönüştür
          const data = response.data.map(candle => [
            candle[0], // openTime
            candle[1], // open
            candle[2], // high
            candle[3], // low
            candle[4], // close
            candle[5], // volume
            candle[0], // closeTime (openTime + interval)
            candle[6] || candle[5], // quoteAssetVolume
            "0", // trades
            "0", // takerBuyBaseAssetVolume
            "0"  // takerBuyQuoteAssetVolume
          ]);
          callback(data);
        } else {
          console.error('Bitget API Hatası:', response);
          callback([]);
        }
      } catch (error) {
        console.error('Bitget API veri işleme hatası:', error);
        callback([]);
      }
    } else if (xhr.readyState === 4) {
      console.error('Bitget API request hatası:', xhr.status);
      callback([]);
    }
  };
  xhr.send();
}

// Bitget API'den mum verilerini al - 3 dakikalık veri için güncellendi
async function fetchCandles(symbol, interval = '3m', limit = 72) {
  try {
    return new Promise((resolve, reject) => {
      getBitgetData(symbol, interval, limit, function(data) {
        try {
          if (!data || data.length === 0) {
            console.error('Bitget API\'den veri alınamadı');
            reject(new Error('Veri alınamadı'));
            return;
          }

          const candles = data.map(candle => ({
            openTime: parseInt(candle[0]),
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5]),
            closeTime: parseInt(candle[6]),
            quoteAssetVolume: parseFloat(candle[7]) || parseFloat(candle[5]) || 0,
            trades: parseInt(candle[8]) || 0,
            takerBuyBaseAssetVolume: parseFloat(candle[9]) || 0,
            takerBuyQuoteAssetVolume: parseFloat(candle[10]) || 0
          }));
          
          // Global değişkene ata
          latestCandles[symbol] = candles;
          
          console.log(`✅ ${symbol} için ${candles.length} mum verisi alındı (${interval})`);
          resolve(candles);
        } catch (error) {
          console.error('Veri işleme hatası:', error);
          reject(error);
        }
      });
    });
    
  } catch (error) {
    console.error('Mum verileri alınırken hata:', error);
    throw error;
  }
}

// new-analize.js'den analiz fonksiyonları

// Basit Hareketli Ortalama (SMA) hesaplama
function simpleMovingAverage(data, period) {
  const sma = [];
  for (let i = 0; i <= data.length - period; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += parseFloat(data[i + j][4]); // Kapanış fiyatını kullan
    }
    sma.push(sum / period);
  }
  return sma;
}

// Exponential Moving Average (EMA) hesaplama
function exponentialMovingAverage(data, period) {
  const ema = [];
  const k = 2 / (period + 1); // EMA smoothing factor

  // İlk EMA değerini SMA olarak hesapla
  const initialSMA =
    data.slice(0, period).reduce((acc, val) => acc + parseFloat(val[4]), 0) /
    period;
  ema.push(initialSMA);

  // Devam eden EMA değerlerini hesapla
  for (let i = period; i < data.length; i++) {
    const price = parseFloat(data[i][4]);
    const prevEma = ema[ema.length - 1];
    const currentEma = price * k + prevEma * (1 - k);
    ema.push(currentEma);
  }

  return ema;
}

// MACD (Moving Average Convergence Divergence) hesaplama
function calculateMACDAdvanced(
  data,
  shortPeriod = 12,
  longPeriod = 26,
  signalPeriod = 9
) {
  const shortEma = exponentialMovingAverage(data, shortPeriod);
  const longEma = exponentialMovingAverage(data, longPeriod);
  const macdLine = [];

  // MACD çizgisi: kısa vadeli EMA - uzun vadeli EMA
  for (let i = longPeriod - 1; i < data.length; i++) {
    macdLine.push(shortEma[i - longPeriod + 1] - longEma[i - longPeriod + 1]);
  }

  const signalLine = exponentialMovingAverage(macdLine, signalPeriod);

  return { macdLine, signalLine };
}

// Bollinger Bands hesaplama
function calculateBollingerBandsAdvanced(data, period = 20, numOfStdDev = 2) {
  const closingPrices = data.map((candle) => parseFloat(candle[4]));

  if (closingPrices.length < period) {
    console.error(
      "Yeterli veri yok. Bollinger Bands hesaplanamaz. Verilen veri uzunluğu:",
      closingPrices.length
    );
    return [];
  }

  const sma = simpleMovingAverage(data, period);
  const bands = [];

  for (let i = period - 1; i < closingPrices.length; i++) {
    const slice = closingPrices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((acc, val) => acc + val, 0) / period;
    const variance =
      slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    bands.push({
      upper: mean + numOfStdDev * stdDev,
      lower: mean - numOfStdDev * stdDev,
    });
  }

  return bands;
}

// RSI hesaplama
function calculateRSIAdvanced(data, period) {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < period; i++) {
    const change = parseFloat(data[i][4]) - parseFloat(data[i - 1][4]);
    if (change > 0) gains += change;
    else losses -= change;
  }

  gains /= period;
  losses /= period;

  let rs = gains / losses;
  if (isNaN(rs) || rs === Infinity) rs = 0; // Zero if losses are zero or rs is not a number
  const rsi = 100 - 100 / (1 + rs);
  return rsi;
}

// ATR hesaplama
function calculateATRAdvanced(data, period = 14) {
  let trueRanges = [];
  for (let i = 1; i < data.length; i++) {
    let high = parseFloat(data[i][2]);
    let low = parseFloat(data[i][3]);
    let prevClose = parseFloat(data[i - 1][4]);
    let tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  let atr = trueRanges.slice(-period).reduce((a, b) => a + b) / period;
  return atr;
}

// Parabolic SAR hesaplama
function calculateParabolicSARAdvanced(data, step = 0.02, max = 0.2) {
  let sar = [];
  let ep = 0;
  let af = step;
  let bullish = true;
  let lastSAR = parseFloat(data[0][3]); // İlk SAR değeri olarak ilk mumun düşük değerini kullanıyoruz

  for (let i = 1; i < data.length; i++) {
    let high = parseFloat(data[i][2]);
    let low = parseFloat(data[i][3]);

    if (bullish) {
      sar.push(lastSAR);
      if (high > ep) {
        ep = high;
        af = Math.min(af + step, max);
      }
      lastSAR = lastSAR + af * (ep - lastSAR);

      if (lastSAR > low) {
        bullish = false;
        lastSAR = ep;
        ep = low;
        af = step;
      }
    } else {
      sar.push(lastSAR);
      if (low < ep) {
        ep = low;
        af = Math.min(af + step, max);
      }
      lastSAR = lastSAR + af * (ep - lastSAR);

      if (lastSAR < high) {
        bullish = true;
        lastSAR = ep;
        ep = high;
        af = step;
      }
    }
  }

  return sar;
}

// Fibonacci seviyelerini hesapla
function calculateFibonacciLevels(high, low) {
  const diff = high - low;
  return {
    level0: high,
    level23_6: high - 0.236 * diff,
    level38_2: high - 0.382 * diff,
    level50: high - 0.5 * diff,
    level61_8: high - 0.618 * diff,
    level100: low,
  };
}

// Ichimoku Cloud hesaplama
function calculateIchimokuCloud(
  data,
  conversionPeriod = 9,
  basePeriod = 26,
  leadingSpanPeriod = 52
) {
  const conversionLine = [];
  const baseLine = [];
  const leadingSpanA = [];
  const leadingSpanB = [];

  for (let i = conversionPeriod - 1; i < data.length; i++) {
    const conversionHigh = Math.max(
      ...data
        .slice(i - conversionPeriod + 1, i + 1)
        .map((d) => parseFloat(d[2]))
    );
    const conversionLow = Math.min(
      ...data
        .slice(i - conversionPeriod + 1, i + 1)
        .map((d) => parseFloat(d[3]))
    );
    conversionLine.push((conversionHigh + conversionLow) / 2);

    if (i >= basePeriod - 1) {
      const baseHigh = Math.max(
        ...data.slice(i - basePeriod + 1, i + 1).map((d) => parseFloat(d[2]))
      );
      const baseLow = Math.min(
        ...data.slice(i - basePeriod + 1, i + 1).map((d) => parseFloat(d[3]))
      );
      baseLine.push((baseHigh + baseLow) / 2);
    }
  }

  for (let i = 0; i < conversionLine.length; i++) {
    if (i + basePeriod - 1 < conversionLine.length) {
      leadingSpanA.push((conversionLine[i] + baseLine[i]) / 2);
    }
  }

  for (let i = leadingSpanPeriod - 1; i < data.length; i++) {
    const high = Math.max(
      ...data
        .slice(i - leadingSpanPeriod + 1, i + 1)
        .map((d) => parseFloat(d[2]))
    );
    const low = Math.min(
      ...data
        .slice(i - leadingSpanPeriod + 1, i + 1)
        .map((d) => parseFloat(d[3]))
    );
    leadingSpanB.push((high + low) / 2);
  }

  return { conversionLine, baseLine, leadingSpanA, leadingSpanB };
}

// Stochastic RSI hesaplama
function calculateStochasticRSI(data, period = 14, smoothK = 3, smoothD = 3) {
  const rsiValues = calculateRSIAdvanced(data, period);
  const stochRSI = [];
  const k = [];
  const d = [];

  for (let i = period; i < rsiValues.length; i++) {
    const rsiSlice = rsiValues.slice(i - period, i);
    const highRSI = Math.max(...rsiSlice);
    const lowRSI = Math.min(...rsiSlice);
    const stoch = (rsiValues[i] - lowRSI) / (highRSI - lowRSI);
    stochRSI.push(stoch);

    if (stochRSI.length >= smoothK) {
      k.push(stochRSI.slice(-smoothK).reduce((a, b) => a + b) / smoothK);
    }

    if (k.length >= smoothD) {
      d.push(k.slice(-smoothD).reduce((a, b) => a + b) / smoothD);
    }
  }

  return { k, d };
}

// Pivot Points hesaplama
function calculatePivotPoints(high, low, close) {
  const pivot = (high + low + close) / 3;
  return {
    pivot: pivot,
    r1: 2 * pivot - low,
    r2: pivot + (high - low),
    r3: high + 2 * (pivot - low),
    s1: 2 * pivot - high,
    s2: pivot - (high - low),
    s3: low - 2 * (high - pivot),
  };
}

// VWAP hesaplama
function calculateVWAPAdvanced(data) {
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  const vwap = [];

  for (let i = 0; i < data.length; i++) {
    const high = parseFloat(data[i][2]);
    const low = parseFloat(data[i][3]);
    const close = parseFloat(data[i][4]);
    const volume = parseFloat(data[i][5]);

    const typicalPrice = (high + low + close) / 3;
    const TPV = typicalPrice * volume;

    cumulativeTPV += TPV;
    cumulativeVolume += volume;

    vwap.push(cumulativeTPV / cumulativeVolume);
  }

  return vwap;
}

// Dinamik seviyeler hesaplama
function calculateDynamicLevels(latestPrice, decision, atr, multiplier = 2) {
  if (decision === "Long") {
    return {
      stopLoss: latestPrice - atr * multiplier,
      takeProfit: latestPrice + atr * multiplier * 1.5
    };
  } else if (decision === "Short") {
    return {
      stopLoss: latestPrice + atr * multiplier,
      takeProfit: latestPrice - atr * multiplier * 1.5
    };
  }
  return { stopLoss: null, takeProfit: null };
}

// Dinamik stop loss hesaplama
function calculateDynamicStopLoss(latestPrice, decision, atr, multiplier = 2) {
  if (decision === "Long") {
    return latestPrice - atr * multiplier;
  } else if (decision === "Short") {
    return latestPrice + atr * multiplier;
  }
  // Eğer karar "Hold" ise veya başka bir durumda, null döndür
  return null;
}

// Hedef ve Stop-Loss hesaplama (new-analize.js'den)
function calculateTargetsAndStopLoss(
  latestPrice,
  decision,
  takeProfitPercent,
  dynamicStopLoss
) {
  let targetPrice1, targetPrice2, targetPrice3, stopLossPrice, stopLossPercent;

  takeProfitPercent = Math.min(takeProfitPercent, 0.0225);

  if (decision === "Long") {
    targetPrice1 = latestPrice * (1 + takeProfitPercent);
    targetPrice2 = latestPrice * (1 + takeProfitPercent * 1.3);
    targetPrice3 = latestPrice * (1 + takeProfitPercent * 1.6);
    stopLossPrice = latestPrice * (1 - takeProfitPercent);
  } else if (decision === "Short") {
    targetPrice1 = latestPrice * (1 - takeProfitPercent);
    targetPrice2 = latestPrice * (1 - takeProfitPercent * 1.3);
    targetPrice3 = latestPrice * (1 - takeProfitPercent * 1.6);
    stopLossPrice = latestPrice * (1 + takeProfitPercent);
  } else {
    // Eğer karar "Hold" ise veya başka bir durumda
    return {
      targetPrice1: null,
      targetPrice2: null,
      targetPrice3: null,
      stopLossPrice: null,
    };
  }

  return {
    targetPrice1: targetPrice1.toFixed(4),
    targetPrice2: targetPrice2.toFixed(4),
    targetPrice3: targetPrice3.toFixed(4),
    stopLossPrice: stopLossPrice.toFixed(4),
    stopLossPercent: (takeProfitPercent * 100).toFixed(2),
  };
}

// Ana analiz fonksiyonu (new-analize.js'den)
function makeDecision(data) {
  // Eğer Vercel API sonucu varsa onu kullan
  if (window.vercelAnalysisResult) {
    const result = window.vercelAnalysisResult;
    console.log("🚀 Vercel API sonucu kullanılıyor:", result);
    
    // Vercel API sonucunu uygun formata çevir
    return {
      signal: result.decision === 'Hold' ? null : result.decision.toUpperCase(),
      decision: result.decision,
      confidence: result.confidence,
      analysis: {
        longSignals: result.signals.long,
        shortSignals: result.signals.short,
        latestPrice: result.price,
        details: result.details,
        trend: result.decision === 'Long' ? 'Bullish' : result.decision === 'Short' ? 'Bearish' : 'Sideways'
      },
      latestPrice: result.price,
      atr: 100 // Dummy ATR değeri
    };
  }

  if (!data || data.length < 72) {
    console.error("Karar almak için yeterli veri yok. En az 72 mum gerekli.");
    return { signal: null, decision: "Hold", confidence: 0, analysis: {} };
  }

  try {
    // Son 72 mumu kullan
    const last72 = data.slice(-72);
    
    // Son fiyat bilgilerini al
    const latestPrice = parseFloat(last72[last72.length - 1][4]);
    const prevPrice = parseFloat(last72[last72.length - 2][4]);
    const change = latestPrice - prevPrice;
    const changePercent = (change / prevPrice) * 100;

    // Teknik indikatörleri hesapla
    const macd = calculateMACDAdvanced(last72);
    const bollinger = calculateBollingerBandsAdvanced(last72);
    const rsi = calculateRSIAdvanced(last72.slice(-15), 14);
    const atr = calculateATRAdvanced(last72, 14);
    const psar = calculateParabolicSARAdvanced(last72);
    const vwap = calculateVWAPAdvanced(last72);
    const fibonacci = calculateFibonacciLevels(
      Math.max(...last72.map(d => parseFloat(d[2]))),
      Math.min(...last72.map(d => parseFloat(d[3])))
    );
    const ichimoku = calculateIchimokuCloud(last72);
    const stochRSI = calculateStochasticRSI(last72, 14, 3, 3);
    const pivotPoints = calculatePivotPoints(
      parseFloat(last72[last72.length - 1][2]),
      parseFloat(last72[last72.length - 1][3]),
      parseFloat(last72[last72.length - 1][4])
    );

    // SMA ve EMA hesapla
    const sma20 = simpleMovingAverage(last72.slice(-20), 20);
    const ema12 = exponentialMovingAverage(last72.slice(-12), 12);
    const ema26 = exponentialMovingAverage(last72.slice(-26), 26);

    // Karar verme algoritması
    let longSignals = 0;
    let shortSignals = 0;
    let confidence = 0;

    // RSI analizi - Daha aktif sinyal üretimi
    if (rsi < 30) {
      longSignals += 3; // Oversold - güçlü long sinyali
    } else if (rsi > 70) {
      shortSignals += 3; // Overbought - güçlü short sinyali
    } else if (rsi >= 30 && rsi <= 40) {
      longSignals += 2; // Hafif oversold
    } else if (rsi >= 60 && rsi <= 70) {
      shortSignals += 2; // Hafif overbought
    } else if (rsi >= 45 && rsi <= 55) {
      longSignals += 1; // Nötr bölge - hafif yükseliş beklentisi
    }

    // MACD analizi
    if (macd.macdLine && macd.signalLine && macd.macdLine.length > 1 && macd.signalLine.length > 1) {
      const currentMACD = macd.macdLine[macd.macdLine.length - 1];
      const currentSignal = macd.signalLine[macd.signalLine.length - 1];
      const prevMACD = macd.macdLine[macd.macdLine.length - 2];
      const prevSignal = macd.signalLine[macd.signalLine.length - 2];

      // MACD kesişim kontrolü
      if (prevMACD <= prevSignal && currentMACD > currentSignal) {
        longSignals += 3; // Bullish crossover
      } else if (prevMACD >= prevSignal && currentMACD < currentSignal) {
        shortSignals += 3; // Bearish crossover
      }
    }

    // Bollinger Bands analizi
    if (bollinger && bollinger.length > 0) {
      const lastBand = bollinger[bollinger.length - 1];
      if (latestPrice <= lastBand.lower) {
        longSignals += 2; // Alt bandda
      } else if (latestPrice >= lastBand.upper) {
        shortSignals += 2; // Üst bandda
      }
    }

    // Parabolic SAR analizi
    if (psar && psar.length > 1) {
      const currentSAR = psar[psar.length - 1];
      if (latestPrice > currentSAR) {
        longSignals += 1; // Fiyat SAR üzerinde
      } else {
        shortSignals += 1; // Fiyat SAR altında
      }
    }

    // VWAP analizi
    if (vwap && vwap.length > 0) {
      const currentVWAP = vwap[vwap.length - 1];
      if (latestPrice > currentVWAP) {
        longSignals += 1; // Fiyat VWAP üzerinde
      } else {
        shortSignals += 1; // Fiyat VWAP altında
      }
    }

    // Stochastic RSI analizi
    if (stochRSI.k && stochRSI.d && stochRSI.k.length > 0 && stochRSI.d.length > 0) {
      const currentK = stochRSI.k[stochRSI.k.length - 1];
      const currentD = stochRSI.d[stochRSI.d.length - 1];
      
      if (currentK < 20 && currentD < 20) {
        longSignals += 1; // Oversold
      } else if (currentK > 80 && currentD > 80) {
        shortSignals += 1; // Overbought
      }
    }

    // Fibonacci seviye analizi
    if (fibonacci) {
      if (latestPrice <= fibonacci.level61_8) {
        longSignals += 1; // %61.8 seviyesinde destek
      } else if (latestPrice >= fibonacci.level38_2) {
        shortSignals += 1; // %38.2 seviyesinde direnç
      }
    }

    // Fiyat momentum analizi
    if (changePercent > 0.5) {
      longSignals += 1; // Pozitif momentum
    } else if (changePercent < -0.5) {
      shortSignals += 1; // Negatif momentum
    }

    // EMA trend analizi
    if (ema12 && ema26 && ema12.length > 0 && ema26.length > 0) {
      const currentEMA12 = ema12[ema12.length - 1];
      const currentEMA26 = ema26[ema26.length - 1];
      
      if (currentEMA12 > currentEMA26) {
        longSignals += 1; // EMA12 > EMA26 - yükseliş trendi
      } else {
        shortSignals += 1; // EMA12 < EMA26 - düşüş trendi
      }
    }

    // Karar verme - Eşik değerlerini düşürdük
    let decision = "Hold";
    let signal = null;
    
    // Toplam sinyal sayısı ve fark kontrolü
    const totalSignals = longSignals + shortSignals;
    const signalDifference = Math.abs(longSignals - shortSignals);
    
    if (longSignals > shortSignals && longSignals >= 2 && signalDifference >= 1) {
      decision = "Long";
      signal = "LONG";
      confidence = Math.min((longSignals / totalSignals) * 100, 100);
    } else if (shortSignals > longSignals && shortSignals >= 2 && signalDifference >= 1) {
      decision = "Short";
      signal = "SHORT";
      confidence = Math.min((shortSignals / totalSignals) * 100, 100);
    }
    
    // Eğer hala Hold ise ama sinyal var, daha esnek kontrol
    if (decision === "Hold" && totalSignals > 0) {
      if (longSignals > shortSignals) {
        decision = "Long";
        signal = "LONG";
        confidence = Math.min((longSignals / totalSignals) * 100, 100);
      } else if (shortSignals > longSignals) {
        decision = "Short";
        signal = "SHORT";
        confidence = Math.min((shortSignals / totalSignals) * 100, 100);
      }
    }

    // Analiz detayları
    const analysis = {
      rsi: rsi,
      macd: macd,
      bollinger: bollinger && bollinger.length > 0 ? bollinger[bollinger.length - 1] : null,
      atr: atr,
      psar: psar && psar.length > 0 ? psar[psar.length - 1] : null,
      vwap: vwap && vwap.length > 0 ? vwap[vwap.length - 1] : null,
      fibonacci: fibonacci,
      ichimoku: ichimoku,
      stochRSI: stochRSI,
      pivotPoints: pivotPoints,
      longSignals: longSignals,
      shortSignals: shortSignals,
      latestPrice: latestPrice,
      changePercent: changePercent.toFixed(2),
      trend: longSignals > shortSignals ? "Bullish" : shortSignals > longSignals ? "Bearish" : "Sideways"
    };

    console.log(`📊 Analiz Sonucu: ${decision} | Long: ${longSignals}, Short: ${shortSignals} | Confidence: ${confidence.toFixed(1)}%`);

    return {
      signal: signal,
      decision: decision,
      confidence: confidence,
      analysis: analysis,
      latestPrice: latestPrice,
      atr: atr
    };

  } catch (error) {
    console.error("Analiz sırasında hata:", error);
    return { signal: null, decision: "Hold", confidence: 0, analysis: {} };
  }
}

// VWAP hesablama funksiyası
/*
function calculateVWAP(candles) {
  let cumulativeTPV = 0; // Toplam fiyat * hacim
  let cumulativeVolume = 0; // Toplam hacim
  
  const vwap = candles.map(candle => {
    // Tipik fiyat = (yüksek + düşük + kapanış) / 3
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    
    // Kümülatif değerleri güncelle
    cumulativeTPV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    
    // VWAP = Toplam (TP * Hacim) / Toplam Hacim
    return cumulativeTPV / cumulativeVolume;
  });
  
  return vwap;
}
*/

// ATR hesablama
function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) {
    return [];
  }
  
  const trueRanges = [];
  
  // İlk gerçek aralık sadece yüksek-düşük
  trueRanges.push(candles[0].high - candles[0].low);
  
  // Diğer gerçek aralıkları hesapla
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i-1].close;
    
    // TR = max(high-low, |high-prevClose|, |low-prevClose|)
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    
    trueRanges.push(tr);
  }
  
  // İlk ATR = TR'lerin ortalaması
  let atr = [];
  let firstATR = 0;
  
  for (let i = 0; i < period; i++) {
    firstATR += trueRanges[i];
  }
  
  firstATR /= period;
  atr.push(firstATR);
  
  // Qalan ATR'leri hesabla
  for (let i = period; i < trueRanges.length; i++) {
    const currentATR = (atr[atr.length - 1] * (period - 1) + trueRanges[i]) / period;
    atr.push(currentATR);
  }
  
  return atr;
}

// Həcm stabilliyini yoxla
function checkVolumeStability(candles, minStableCount = 5) {
  if (candles.length < minStableCount) {
    return false;
  }
  
  // Son 10 şamın orta həcmi hesabla
  const recentCandles = candles.slice(-10);
  const avgVolume = recentCandles.reduce((sum, candle) => sum + candle.volume, 0) / recentCandles.length;
  
  // Son X şamda həcm sabitliyi
  let stableCount = 0;
  
  for (let i = candles.length - 1; i >= candles.length - minStableCount; i--) {
    const volume = candles[i].volume;
    
    // Həcm orta həcmin VOLUME_MIN_THRESHOLD% -dən çox olmalıdır
    if (volume >= avgVolume * VOLUME_MIN_THRESHOLD) {
      stableCount++;
    } else {
      return false; // Hər hansı bir şam hədd dəyərindən az olarsa, sabit deyil
    }
  }
  
  return stableCount >= minStableCount;
}

// Həcm impulsunu yoxla
function checkVolumeImpulse(candles, threshold = VOLUME_IMPULSE_THRESHOLD) {
  if (candles.length < 6) {
    return false;
  }
  
  // Son 5 şamın orta həcmi
  const recentCandles = candles.slice(-6, -1); // Son şam xaric son 5 şam
  const avgVolume = recentCandles.reduce((sum, candle) => sum + candle.volume, 0) / recentCandles.length;
  
  // Son şamın həcmi
  const lastVolume = candles[candles.length - 1].volume;
  
  // Həcm impuls həddinə çatıbmı
  return lastVolume >= avgVolume * threshold;
}

// Qiymət impulsunu yoxla
function checkPriceImpulse(candle, threshold = PRICE_IMPULSE_THRESHOLD) {
  // Şamın açılış-bağlanış % fərqi
  const priceChange = Math.abs(candle.close - candle.open) / candle.open * 100;
  
  // Qiymət impuls həddinə çatıbmı
  return priceChange >= threshold;
}

// Ardıcıl siqnalları yoxla
function checkConsecutiveSignals(symbol, signal, type) {
  const key = `${symbol}-${type}`;
  
  // Əgər yeni bir siqnal gəlibsə
  if (!consecutiveSignals[key] || consecutiveSignals[key].signal !== signal) {
    consecutiveSignals[key] = {
      signal: signal,
      count: 1,
      timestamp: Date.now()
    };
    return false;
  }
  
  // Siqnal eyni isə və 60 saniyədən az vaxt keçibsə
  const timeDiff = Date.now() - consecutiveSignals[key].timestamp;
  if (timeDiff <= 60000) { // 60 saniyə = 1 dəqiqə
    consecutiveSignals[key].count++;
    consecutiveSignals[key].timestamp = Date.now();
    
    // Ardıcıl siqnal sayı kifayət qədərdirsə
    return consecutiveSignals[key].count >= CONSECUTIVE_SIGNAL_COUNT;
  } else {
    // Vaxt keçibsə sıfırla
    consecutiveSignals[key] = {
      signal: signal,
      count: 1,
      timestamp: Date.now()
    };
    return false;
  }
}

// Piyasa analizi - yenilənmiş məntiq ilə
function analyzeMarket(symbol, limit) {
  try {
    // Sembol için mum verileri var mı kontrol et
    if (!latestCandles[symbol] || !Array.isArray(latestCandles[symbol]) || 
        !latestFiveMinCandles[symbol] || !Array.isArray(latestFiveMinCandles[symbol])) {
      throw new Error(`${symbol} için mum verileri bulunamadı`);
    }
    
    // 1 dəqiqəlik mumlar
    const candles1m = latestCandles[symbol].slice(-limit);
    const closePrices1m = candles1m.map(candle => candle.close);
    
    // 5 dəqiqəlik mumlar
    const candles5m = latestFiveMinCandles[symbol];
    const closePrices5m = candles5m.map(candle => candle.close);
    
    // EMA hesablama (1m)
    const ema9 = calculateEMA(closePrices1m, 9);
    const ema21 = calculateEMA(closePrices1m, 21);
    
    // EMA hesablama (5m)
    const ema50 = calculateEMA(closePrices5m, 50);
    const ema200 = calculateEMA(closePrices5m, 200);
    
    // RSI hesablama (1m)
    const rsi7 = calculateRSI(closePrices1m, 7);
    
    // VWAP hesablama (1m)
    const vwap = calculateVWAP(candles1m);
    
    // ATR hesablama (1m)
    const atr = calculateATR(candles1m, 14);
    
    // Son dəyərlər
    const lastCandle = candles1m[candles1m.length - 1]; // Son şam
    const lastClose = lastCandle.close;
    const lastEMA9 = ema9[ema9.length - 1];
    const lastEMA21 = ema21[ema21.length - 1];
    const lastRSI = rsi7[rsi7.length - 1];
    const lastVWAP = vwap[vwap.length - 1];
    const lastATR = atr[atr.length - 1];
    
    // Son 3 şamın EMA qarşılaşdırması
    let emaPositiveCrossCount = 0;
    let emaNegativeCrossCount = 0;
    
    for (let i = 1; i <= 3; i++) {
      if (i >= ema9.length || i >= ema21.length) break;
      
      if (ema9[ema9.length - i] > ema21[ema21.length - i]) {
        emaPositiveCrossCount++;
      } else {
        emaNegativeCrossCount++;
      }
    }
    
    // 5 dəqiqəlik trend təyin etmək
    const lastEMA50 = ema50[ema50.length - 1];
    const lastEMA200 = ema200[ema200.length - 1];
    const trend5m = lastEMA50 > lastEMA200 ? 'LONG' : 'SHORT';
    
    // Həcm impulsu yoxla
    const volumeImpulse = checkVolumeImpulse(candles1m);
    
    // Qiymət impulsu yoxla
    const priceImpulse = checkPriceImpulse(lastCandle);
    
    // Bütün şərtləri ayrı-ayrı saxla
    const conditions = {
      // Long şərtləri
      longEmaCondition: emaPositiveCrossCount >= 3, // Son 3 şamda EMA(9) > EMA(21)
      longRsiCondition: lastRSI >= 40 && lastRSI <= 55, // RSI 40-55 arasında
      longVolumeCondition: volumeImpulse, // Həcm impulsu
      longVwapCondition: lastClose > lastVWAP, // Qiymət VWAP üzərində
      
      // Short şərtləri
      shortEmaCondition: emaNegativeCrossCount >= 3, // Son 3 şamda EMA(9) < EMA(21)
      shortRsiCondition: lastRSI >= 60 && lastRSI <= 80, // RSI 60-80 arasında
      shortVolumeCondition: volumeImpulse, // Həcm impulsu
      shortVwapCondition: lastClose < lastVWAP, // Qiymət VWAP altında
      
      // İmpuls şərtləri
      priceImpulse: priceImpulse,
      volumeImpulse: volumeImpulse
    };
    
    // Sinyal məntiqi
    let signal = null;
    let reason = '';
    
    // Skalping Siqnalları - Standart
    if (conditions.longEmaCondition && conditions.longRsiCondition && conditions.longVwapCondition) {
      signal = 'LONG';
      reason = 'Scalping Siqnalı: EMA, RSI və VWAP şərtləri uyğundur';
    } 
    else if (conditions.shortEmaCondition && conditions.shortRsiCondition && conditions.shortVwapCondition) {
      signal = 'SHORT';
      reason = 'Scalping Siqnalı: EMA, RSI və VWAP şərtləri uyğundur';
    }
    // İmpuls girişi - daha sürətli siqnallar
    else if (priceImpulse && volumeImpulse) {
      if (lastClose > lastVWAP) {
        signal = 'LONG';
        reason = 'İmpuls Girişi: Qiymət və həcm impulsu təsdiqləndi';
      } else {
        signal = 'SHORT';
        reason = 'İmpuls Girişi: Qiymət və həcm impulsu təsdiqləndi';
      }
    }
    // Elastik siqnallar - 2 şərtdən biri
    else if ((conditions.longEmaCondition && conditions.longVwapCondition) || 
             (conditions.longRsiCondition && conditions.longVolumeCondition)) {
      signal = 'LONG';
      reason = 'Elastik Giriş: İki siqnal şərti uyğundur';
    }
    else if ((conditions.shortEmaCondition && conditions.shortVwapCondition) || 
             (conditions.shortRsiCondition && conditions.shortVolumeCondition)) {
      signal = 'SHORT';
      reason = 'Elastik Giriş: İki siqnal şərti uyğundur';
    }
    
    // 3 ardıcıl dəqiqədə eyni siqnal gəlirsə təsdiqlənsin
    let confirmedSignal = signal;
    if (signal) {
      const isConsecutive = checkConsecutiveSignals(symbol, signal, limit);
      if (!isConsecutive && !priceImpulse) {
        // Əgər ardıcıl deyilsə və qiymət impulsu yoxdursa, siqnalı ləğv et
        confirmedSignal = null;
        reason = 'Siqnal təsdiqlənmədi: 3 ardıcıl eyni siqnal lazımdır';
      } else if (isConsecutive) {
        reason += ' (3 ardıcıl təsdiqləndi)';
      }
    }
    
    return {
      signal: confirmedSignal,
      analysis: {
        ema9: lastEMA9,
        ema21: lastEMA21,
        ema50: lastEMA50,
        ema200: lastEMA200,
        rsi7: lastRSI,
        vwap: lastVWAP,
        atr: lastATR,
        trend5m: trend5m,
        volumeImpulse: volumeImpulse,
        priceImpulse: priceImpulse,
        conditions: conditions,
        reason: reason
      }
    };
  } catch (error) {
    console.error('Analiz sırasında hata:', error);
    throw error;
  }
}

// SMA hesaplama
function calculateSMA(data, period) {
  const sma = [];
  
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    sma.push(sum / period);
  }
  
  return sma;
}

// RSI hesaplama
/*
function calculateRSI(data, period) {
  const rsi = [];
  const gains = [0];
  const losses = [0];
  
  // Fiyat değişimlerini hesapla
  for (let i = 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  // İlk ortalama kazanç ve kayıpları hesapla
  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  
  // İlk RSI hesapla
  rsi.push(100 - (100 / (1 + avgGain / (avgLoss === 0 ? 0.001 : avgLoss))));
  
  // Kalan RSI değerlerini hesapla
  for (let i = period + 1; i < data.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    rsi.push(100 - (100 / (1 + avgGain / (avgLoss === 0 ? 0.001 : avgLoss))));
  }
  
  return rsi;
}
*/

// Tüm analizleri başlat - Yeni analiz sistemi ile
async function startAllAnalyses() {
  try {
    // Seçilen sembol
    const symbol = symbolSelect.value;
    
    if (!symbol) {
      updateStatus('Lütfen bir kripto para birimi seçin!');
      return;
    }
    
    updateStatus(`${symbol} analiz ediliyor... (3 dakikalık 72 mum)`)

    // 3 dakikalık 72 mum verisini al
    const candleData = await fetchCandles(symbol, '3m', 72);
    
    if (!candleData || candleData.length < 72) {
      updateStatus('Yeterli veri alınamadı. En az 72 mum gerekli.');
      return;
    }

    // new-analize.js stilinde veri formatına dönüştür
    const formattedData = candleData.map(candle => [
      candle.openTime.toString(),
      candle.open.toString(),
      candle.high.toString(),
      candle.low.toString(),
      candle.close.toString(),
      candle.volume.toString(),
      candle.closeTime.toString(),
      candle.quoteAssetVolume.toString(),
      candle.trades.toString(),
      candle.takerBuyBaseAssetVolume.toString(),
      candle.takerBuyQuoteAssetVolume.toString()
    ]);

    // Analiz yap (new-analize.js'deki makeDecision fonksiyonu)
    const analysisResult = makeDecision(formattedData);
    
    if (!analysisResult) {
      updateStatus('Analiz işlemi başarısız oldu.');
      return;
    }

    // Güncel fiyat
    const currentPrice = analysisResult.latestPrice;
    
    // İndikator panelini güncelle
    updateIndicatorPanelNew(symbol, analysisResult);
    
    // Hedef ve stop loss hesapla
    let targets = null;
    if (analysisResult.signal) {
      // Take profit %0.20 olarak ayarla (new-analize.js'deki gibi)
      const takeProfitPercent = 0.0020; // %0.20
      const dynamicStopLoss = calculateDynamicStopLoss(currentPrice, analysisResult.decision, analysisResult.atr, 2);
      
      targets = calculateTargetsAndStopLoss(
        currentPrice,
        analysisResult.decision,
        takeProfitPercent,
        dynamicStopLoss
      );
    }
    
    // Analiz sonuçlarını tüm limitler için kullan
    const analysisResults = {};
    for (const limit in LIMITS) {
      analysisResults[limit] = {
        signal: analysisResult.signal,
        decision: analysisResult.decision,
        confidence: analysisResult.confidence,
        analysis: analysisResult.analysis,
        targets: targets
      };
    }
    
    // Her limit için analizi başlat
    let noSignalCount = 0;
    
    for (const limit in LIMITS) {
      const result = await startAnalysis(symbol, limit, {
        entryPrice: currentPrice,
        currentPrice: currentPrice,
        analysisResult: analysisResults[limit]
      });
      
      // Sinyal olmadığında sayacı artır
      if (!analysisResults[limit].signal) {
        noSignalCount++;
      }
    }
    
    // Sinyal olmayan sayını tablonun başlığında göster
    if (noSignalCount > 0) {
      for (const limit in LIMITS) {
        const cardHeader = document.querySelector(`#${LIMITS[limit].tableBodyId}`).closest('.card').querySelector('.card-header h2');
        if (cardHeader) {
          // Önceki "Sinyal Yok" mesajını temizle
          const existingMsg = cardHeader.querySelector('.no-signal-msg');
          if (existingMsg) {
            existingMsg.remove();
          }
          
          // Yeni mesaj ekle
          const noSignalMsg = document.createElement('span');
          noSignalMsg.className = 'no-signal-msg';
          noSignalMsg.innerHTML = `Sinyal Yok: ${noSignalCount}`;
          cardHeader.appendChild(noSignalMsg);
        }
      }
    }
    
    const statusMsg = `${symbol} analizi tamamlandı. ${analysisResult.signal ? `Sinyal: ${analysisResult.signal} (${analysisResult.confidence.toFixed(1)}%)` : 'Sinyal bulunamadı'}`;
    updateStatus(statusMsg);
    
  } catch (error) {
    console.error('Analiz sırasında hata:', error);
    updateStatus('Analiz sırasında bir hata oluştu!');
  }
}

// Yeni indikator paneli güncelleme fonksiyonu
function updateIndicatorPanelNew(symbol, analysisResult) {
  if (!analysisResult || !analysisResult.analysis) {
    return;
  }

  const analysis = analysisResult.analysis;
  
  // Değerleri formatlama
  const formatValue = (value) => {
    if (typeof value === 'number') {
      if (value < 0.0001) {
        return value.toExponential(4);
      }
      if (value > 0 && value < 100) {
        return value.toFixed(2);
      }
      return value.toFixed(6);
    }
    return value || '-';
  };

  // İndikator değerlerini güncelle
  if (document.getElementById('ema9Value')) {
    document.getElementById('ema9Value').textContent = analysis.macd?.macdLine ? 
      formatValue(analysis.macd.macdLine[analysis.macd.macdLine.length - 1]) : '-';
  }
  
  if (document.getElementById('ema21Value')) {
    document.getElementById('ema21Value').textContent = analysis.macd?.signalLine ? 
      formatValue(analysis.macd.signalLine[analysis.macd.signalLine.length - 1]) : '-';
  }
  
  // RSI değeri
  const rsiElement = document.getElementById('rsiValue');
  if (rsiElement) {
    rsiElement.textContent = formatValue(analysis.rsi);
  }
  
  // Bollinger Bands
  const bollingerElement = document.getElementById('bollingerValue');
  if (bollingerElement && analysis.bollinger) {
    const band = analysis.bollinger;
    bollingerElement.textContent = `U:${formatValue(band.upper)} L:${formatValue(band.lower)}`;
  }
  
  // ATR
  const atrElement = document.getElementById('atrValue');
  if (atrElement) {
    atrElement.textContent = formatValue(analysis.atr);
  }
  
  // Score değerleri
  const longScoreElement = document.getElementById('longScoreValue');
  if (longScoreElement) {
    longScoreElement.textContent = analysis.longSignals || 0;
  }
  
  const shortScoreElement = document.getElementById('shortScoreValue');
  if (shortScoreElement) {
    shortScoreElement.textContent = analysis.shortSignals || 0;
  }
  
  // Sinyal açıklaması
  const reasonElement = document.getElementById('signalReasonValue');
  if (reasonElement) {
    reasonElement.textContent = `${analysisResult.decision} (${formatValue(analysisResult.confidence)}% Confidence)`;
  }
  
  // Trend durumu
  const trendElement = document.getElementById('trendValue');
  if (trendElement) {
    trendElement.textContent = analysis.trend || 'Bilinmiyor';
    trendElement.className = `indicator-value ${analysis.trend?.toLowerCase() || ''}`;
  }
}

// Belirli bir limit için analiz başlat - Yeni sistem
async function startAnalysis(symbol, limit, sharedData) {
  try {
    // O limit için aktif analiz var mı kontrol et
    const limitKey = `${symbol}-${limit}`;
    if (activeAnalysisFlags[limitKey]) {
      // Zaten aktif bir analiz varsa, yeni analiz başlatma
      return false;
    }
    
    // Analiz sonucunu al
    const result = sharedData.analysisResult;
    
    // Sinyal durumunu göster
    let signalMessage;
    if (result.signal) {
      // Confidence kontrolü - minimum %40 olsun (daha esnek)
      if (result.confidence < 40) {
        signalMessage = `${symbol} için ${limit} mum analizinde ${result.signal} sinyali bulundu, fakat confidence çok düşük (%${result.confidence.toFixed(1)}).`;
        updateStatus(signalMessage);
        return false;
      }
      
      signalMessage = `${symbol} için ${limit} mum analizinde ${result.signal} sinyali oluşturuldu. (Confidence: %${result.confidence.toFixed(1)})`;
      
      // Aktif analiz bayrağını ayarla
      activeAnalysisFlags[limitKey] = true;
      
      // TP ve SL değerlerini al (new-analize.js'den hesaplanan)
      let takeProfit, stopLoss;
      
      if (result.targets) {
        if (result.signal === 'LONG') {
          takeProfit = parseFloat(result.targets.targetPrice1);
          stopLoss = parseFloat(result.targets.stopLossPrice);
        } else { // SHORT
          takeProfit = parseFloat(result.targets.targetPrice1);
          stopLoss = parseFloat(result.targets.stopLossPrice);
        }
      } else {
        // Hedefler yoksa varsayılan hesaplama
        if (result.signal === 'LONG') {
          takeProfit = sharedData.entryPrice * 1.0020; // %0.20 üst
          stopLoss = sharedData.entryPrice * 0.9980; // %0.20 alt
        } else { // SHORT
          takeProfit = sharedData.entryPrice * 0.9980; // %0.20 alt
          stopLoss = sharedData.entryPrice * 1.0020; // %0.20 üst
        }
      }
      
      // Konsolda bilgilendirme mesajı
      console.log(`Analiz: ${result.decision}, Confidence: %${result.confidence.toFixed(1)}, TP: ${takeProfit}, SL: ${stopLoss}`);
      
      // Martingale işlem parametrelerini al
      const tradeRecommendation = generateTradeRecommendation(symbol, result.signal, sharedData.entryPrice);
      
      // Analiz objesini oluştur (martingale parametreleriyle)
      const analysis = {
        id: Date.now().toString() + limit,
        symbol,
        signal: result.signal,
        entryPrice: sharedData.entryPrice,
        currentPrice: sharedData.currentPrice,
        takeProfit: tradeRecommendation.takeProfit,
        stopLoss: tradeRecommendation.stopLoss,
        result: 'Bekleniyor',
        startTime: Date.now(),
        isActive: true,
        confidence: result.confidence,
        // Martingale bilgileri
        martingaleLevel: tradeRecommendation.level,
        margin: tradeRecommendation.margin,
        leverage: tradeRecommendation.leverage,
        positionSize: tradeRecommendation.positionSize,
        profitTarget: tradeRecommendation.profitTarget,
        fees: tradeRecommendation.fees,
        isRecovery: tradeRecommendation.isRecovery,
        recoveryInfo: tradeRecommendation.recoveryInfo
      };
      
      // Tabloya ekle
      addAnalysisToTable(analysis, limit);
      
      // localStorage'a kaydet
      saveToStorage(limit);
      
      // İzlemeyi başlat
      startWatcher(analysis, limit);
    } else {
      signalMessage = `${symbol} için ${limit} mum analizinde sinyal bulunamadı.`;
      
      // Sinyal olmayan sayısını artır ve tablonun başlığında göstər
      if (!noSignalCounters[limitKey]) {
        noSignalCounters[limitKey] = 0;
      }
      noSignalCounters[limitKey]++;
      
      // Tablonun başlığını güncelle
      updateTableHeaderWithNoSignalCount(limit, noSignalCounters[limitKey]);
      
      // Sinyal yoksa 15 saniye sonra tekrar dene
      if (noSignalTimers[limitKey]) {
        clearTimeout(noSignalTimers[limitKey]);
      }
      
      noSignalTimers[limitKey] = setTimeout(() => {
        // Tekrar analiz yap
        delete noSignalTimers[limitKey];
        startAllAnalyses();
      }, NO_SIGNAL_RETRY_INTERVAL);
    }
    
    updateStatus(signalMessage);
    
    return true;
  } catch (error) {
    console.error(`${limit} mum analizi sırasında hata:`, error);
    updateStatus(`${limit} mum analizi sırasında bir hata oluştu!`);
    return false;
  }
}

// Tablonun başlığını sinyal olmayan sayısı ile güncelle
function updateTableHeaderWithNoSignalCount(limit, count) {
  const cardHeader = document.querySelector(`#${LIMITS[limit].tableBodyId}`).closest('.card').querySelector('.card-header h2');
  if (cardHeader) {
    // Əvvəlcə əgər varsa köhnə "Sinyal Yok" mesajını təmizlə
    const existingMsg = cardHeader.querySelector('.no-signal-msg');
    if (existingMsg) {
      existingMsg.remove();
    }
    
    // Yeni mesaj əlavə et
    const noSignalMsg = document.createElement('span');
    noSignalMsg.className = 'no-signal-msg';
    noSignalMsg.innerHTML = `Sinyal Yok: ${count}`;
    cardHeader.appendChild(noSignalMsg);
  }
}

// Bitget API'den mevcut fiyatı al
async function getCurrentPrice(symbol) {
  try {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`;

      xhr.open("GET", url, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              if (response && response.code === '00000' && response.data && response.data.length > 0 && response.data[0].lastPr) {
                resolve(parseFloat(response.data[0].lastPr));
              } else {
                console.error('Bitget Price API Hatası:', response);
                resolve(null);
              }
            } catch (error) {
              console.error('Fiyat veri işleme hatası:', error);
              resolve(null);
            }
          } else {
            console.error('Fiyat API request hatası:', xhr.status);
            resolve(null);
          }
        }
      };
      xhr.send();
    });
  } catch (error) {
    console.error('Fiyat alınırken hata:', error);
    return null;
  }
}

// Aktif izleyicilerin fiyat kontrolü
async function checkActivePrices() {
  // Aktif tüm izlemeler için sembolleri topla
  const activeSymbols = new Set();
  
  // Her izleyici için sembolü al
  Object.keys(activeWatchers).forEach(watcherId => {
    const [id, limit] = watcherId.split('-');
    const tableBodyId = LIMITS[limit].tableBodyId;
    const row = document.getElementById(tableBodyId).querySelector(`tr[data-id="${id}"]`);
    
    if (row) {
      const symbol = row.getAttribute('data-symbol');
      activeSymbols.add(symbol);
    }
  });
  
  // Her sembol için bir kez fiyat al ve tüm ilgili izleyicileri güncelle
  for (const symbol of activeSymbols) {
    try {
      const currentPrice = await getCurrentPrice(symbol);
      
      if (!currentPrice) {
        console.error(`${symbol} için fiyat alınamadı.`);
        continue;
      }
      
      // Tüm aktif izleyicileri güncelle
      Object.keys(activeWatchers).forEach(watcherId => {
        const [id, limit] = watcherId.split('-');
        const tableBodyId = LIMITS[limit].tableBodyId;
        const row = document.getElementById(tableBodyId).querySelector(`tr[data-id="${id}"]`);
        
        if (row && row.getAttribute('data-symbol') === symbol) {
          // Fiyatı güncelle
          updatePrice(id, currentPrice, limit);
          
          // TP veya SL'e ulaşıldı mı?
          checkTargets(id, currentPrice, limit);
        }
      });
      
    } catch (error) {
      console.error(`${symbol} için fiyat kontrolü sırasında hata:`, error);
    }
  }
}

// Tabloya analiz ekle
function addAnalysisToTable(analysis, limit) {
  const tableBodyId = LIMITS[limit].tableBodyId;
  const tableBody = document.getElementById(tableBodyId);
  
  // Əgər analiz obyektində null və ya undefined dəyərlər varsa, onları düzəlt
  if (!analysis.entryPrice || isNaN(analysis.entryPrice)) analysis.entryPrice = 0;
  if (!analysis.currentPrice || isNaN(analysis.currentPrice)) analysis.currentPrice = 0;
  if (!analysis.takeProfit || isNaN(analysis.takeProfit)) analysis.takeProfit = 0;
  if (!analysis.stopLoss || isNaN(analysis.stopLoss)) analysis.stopLoss = 0;
  if (!analysis.slPercentage) analysis.slPercentage = 0.22; // Varsayılan SL yüzdesi
  
  const row = document.createElement('tr');
  row.setAttribute('data-id', analysis.id);
  row.setAttribute('data-symbol', analysis.symbol);
  row.setAttribute('data-signal', analysis.signal);
  row.setAttribute('data-entry-price', analysis.entryPrice);
  row.setAttribute('data-current-price', analysis.currentPrice);
  row.setAttribute('data-tp', analysis.takeProfit);
  row.setAttribute('data-sl', analysis.stopLoss);

  row.setAttribute('data-result', analysis.result);
  row.setAttribute('data-start-time', analysis.startTime);
  row.setAttribute('data-active', analysis.isActive);
  row.setAttribute('data-time', analysis.startTime || Date.now()); // Sıralama üçün zaman dəyəri
  
  // Azerbaycan zaman dilimine göre tarih ve saat formatı
  const options = {
    timeZone: 'Asia/Baku',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  const startTime = new Date(analysis.startTime).toLocaleString('az-AZ', options);
  
  // Özel sinyal sınıfı - SİNYAL YOK durumu için
  const signalClass = analysis.signal === 'SİNYAL YOK' ? 'NO_SIGNAL' : analysis.signal;
  
  // Recovery durumu göstergesi
  const recoveryBadge = analysis.isRecovery ? ` <span class="recovery-badge">L${analysis.martingaleLevel}</span>` : '';
  const marginInfo = analysis.margin ? `<br><small>Margin: ${analysis.margin} USDT (${analysis.leverage}x)</small>` : '';
  
  // TP için kar miktarı ve ROI hesapla - net kar göster (ücretler çıkarılmış)
  let tpAmount = '0.0000';
  let tpROI = '0.00';
  let tpPrice = '0.000000';
  
  if (analysis.entryPrice && analysis.takeProfit) {
    // ROI = fiyat değişim yüzdesi
    const tpPriceChangePercent = Math.abs((analysis.takeProfit - analysis.entryPrice) / analysis.entryPrice);
    tpROI = (tpPriceChangePercent * 100).toFixed(2);
    
    // TP kar miktarı = profitTarget değeri (net kar - ücretler çıkarılmış)
    tpAmount = analysis.profitTarget ? analysis.profitTarget.toFixed(4) : '0.0000';
    tpPrice = analysis.takeProfit.toFixed(10);
  }
  
  const tpInfo = tpPrice !== '0.000000' ? `${tpPrice}<br><small>ROI: ${tpROI}%</small>` : '';
  
  // SL için fiyat ve ROI hesapla - sadece bunlar kalsın
  let slROI = '0.00';
  let slPrice = '0.000000';
  
  if (analysis.entryPrice && analysis.stopLoss) {
    // ROI = fiyat değişim yüzdesi
    const slPriceChangePercent = Math.abs((analysis.entryPrice - analysis.stopLoss) / analysis.entryPrice);
    slROI = (slPriceChangePercent * 100).toFixed(2);
    slPrice = analysis.stopLoss.toFixed(10);
  }
  
  const slInfo = slPrice !== '0.000000' ? `${slPrice}<br><small>ROI: ${slROI}%</small>` : '';

  row.innerHTML = `
    <td>${analysis.symbol}</td>
    <td class="${signalClass}">${analysis.signal}${recoveryBadge}</td>
    <td>${analysis.entryPrice.toFixed(10)}${marginInfo}</td>
    <td class="current-price">${analysis.currentPrice.toFixed(10)}</td>
    <td>${tpInfo || 'Hesaplanıyor...'}</td>
    <td>${slInfo || 'Hesaplanıyor...'}</td>
    <td class="result ${analysis.result === 'TP' ? 'TP' : analysis.result === 'SL' ? 'SL' : analysis.result === 'SİNYAL YOK' ? 'NO_SIGNAL' : 'waiting'}">${analysis.result}</td>
    <td>${startTime}</td>
  `;
  
  tableBody.appendChild(row);
  
  // Tablo istatistiklerini güncelle
  updateTableStats(limit);
  
  // Analiz bilgi panelini güncelle
  updateAnalysisInfoPanel();
}

// İzlemeyi başlat
function startWatcher(analysis, limit) {
  // İzleme başlatılırken yeni bir ID oluştur
  const watcherId = `${analysis.symbol}-${analysis.id}`;
  
  // Eğer bu izleyici zaten aktifse, başlatma
  if (activeWatchers[watcherId]) {
    return;
  }
  
  // Siqnal jurnalına əlavə et
  logSignal(analysis.signal, analysis);
  
  console.log(`${analysis.symbol} için ${analysis.signal} izleme başlatıldı. TP: ${analysis.takeProfit}, SL: ${analysis.stopLoss}`);
  
  // İzleyiciyi başlat ve sakla
  const watcher = setInterval(async () => {
    try {
      // Son fiyatı al
      const currentPrice = await getCurrentPrice(analysis.symbol);
      
      if (!currentPrice) {
        console.error(`${analysis.symbol} fiyatı alınamadı`);
        return;
      }
      
      // Tabloyu güncelle
      updatePrice(analysis.id, currentPrice, limit);
      
      // Sinyal tipine göre hedeflere ulaşıldı mı kontrol et
      let result = null;
      
      if (analysis.signal === 'LONG') {
        if (currentPrice >= analysis.takeProfit) {
          result = 'TP';
        } else if (currentPrice <= analysis.stopLoss) {
          result = 'SL';
        }
      } else if (analysis.signal === 'SHORT') {
        if (currentPrice <= analysis.takeProfit) {
          result = 'TP';
        } else if (currentPrice >= analysis.stopLoss) {
          result = 'SL';
        }
      }
      
      // Eğer sonuç elde edilmişse
      if (result) {
        // İzlemeyi durdur
        clearInterval(watcher);
        delete activeWatchers[watcherId];
        
        // Aktif analiz bayrağını kaldır
        const limitKey = `${analysis.symbol}-${limit}`;
        delete activeAnalysisFlags[limitKey];
        
        // Martingale sonuç işleme - JSON'dan doğru değerleri al
        const levelIndex = (analysis.level || 1) - 1;
        const currentLevelParams = MARTINGALE_LEVELS[levelIndex] || MARTINGALE_LEVELS[0];
        
        const tradeParams = {
          profitTarget: analysis.profitTarget,
          slAmount: currentLevelParams.slAmount, // JSON'dan doğru SL miktarı
          level: analysis.level || 1
        };
        
        // Balansı güncelle ve martingale durumunu yönet
        processTradeResult(result, tradeParams, 0);
        
        // Sonucu güncelle
        updateResult(analysis.id, result, limit);
        
        // Siqnal jurnalında nəticəni qeyd et
        logSignal(analysis.signal, analysis, result);
        
        // Bildirim ver
        let resultMessage = `${analysis.symbol} ${analysis.signal} sinyali için ${result} elde edildi!`;
        resultMessage += ` Giriş: ${analysis.entryPrice.toFixed(6)}, Son: ${currentPrice.toFixed(6)}`;
        resultMessage += ` | Level: ${analysis.martingaleLevel}`;
        
        if (result === 'TP') {
          resultMessage += ` | ✅ Kar: 0.04 USDT`;
        } else {
          resultMessage += ` | ❌ Level ${currentLevelParams ? (levelIndex + 2) : 2}'ye geçiş`;
        }
        
        updateStatus(resultMessage);
        
        // Analiz bilgi panelini güncelle
        updateAnalysisInfoPanel();
        
        // Otomatik modda kontrol et
        checkAutoMode();
      }
    } catch (error) {
      console.error(`İzleme sırasında hata: ${error.message}`);
    }
  }, UPDATE_INTERVAL);
  
  // Aktif izleyicileri saklın
  activeWatchers[watcherId] = watcher;
}

// Fiyatı güncelle
function updatePrice(id, price, limit) {
  const tableBodyId = LIMITS[limit].tableBodyId;
  const row = document.getElementById(tableBodyId).querySelector(`tr[data-id="${id}"]`);
  
  if (row) {
    row.setAttribute('data-current-price', price);
    const priceCell = row.querySelector('.current-price');
    
    if (priceCell) {
      priceCell.textContent = price.toFixed(10);
    }
  }
}

// TP veya SL hedeflerini kontrol et
function checkTargets(id, currentPrice, limit) {
  const tableBodyId = LIMITS[limit].tableBodyId;
  const row = document.getElementById(tableBodyId).querySelector(`tr[data-id="${id}"]`);
  
  if (!row) return;
  
  const signal = row.getAttribute('data-signal');
  const takeProfit = parseFloat(row.getAttribute('data-tp'));
  const stopLoss = parseFloat(row.getAttribute('data-sl'));
  const isActive = row.getAttribute('data-active') === 'true';
  
  if (!isActive) return;
  
  let result = null;
  
  if (signal === 'LONG') {
    if (currentPrice >= takeProfit) {
      result = 'TP';
    } else if (currentPrice <= stopLoss) {
      result = 'SL';
    }
  } else if (signal === 'SHORT') {
    if (currentPrice <= takeProfit) {
      result = 'TP';
    } else if (currentPrice >= stopLoss) {
      result = 'SL';
    }
  }
  
  if (result) {
    // Sonucu güncelle
    updateResult(id, result, limit);
    
    // İzleyiciyi durdur
    stopWatcher(id, limit);
    
    // Bildirim ekle
    updateStatus(`${row.getAttribute('data-symbol')} için ${limit} mum analizinde ${result} hedefine ulaşıldı!`);
  }
}

// Sonucu güncelle
function updateResult(analysisId, result, limit) {
  const tableBodyId = LIMITS[limit].tableBodyId;
  const rows = document.getElementById(tableBodyId).querySelectorAll('tr');
  
  for (let row of rows) {
    if (row.getAttribute('data-id') === analysisId) {
      row.setAttribute('data-result', result);
      row.setAttribute('data-active', 'false');
      
      const resultCell = row.querySelector('td.result');
      if (resultCell) {
        // Sonuca göre sınıf ekle
        resultCell.className = `result ${result === 'TP' ? 'TP' : result === 'SL' ? 'SL' : 'waiting'}`;
        resultCell.textContent = result;
      }
      
      // İlgili analiz objesini bul
      const analysis = getAnalysisFromTable(analysisId, limit);
      
      // Jurnal faylına nəticəni qeyd et
      if (analysis) {
        logSignal(analysis.signal, analysis, result);
      }
      
      // Tablo istatistiklerini güncelle
      updateTableStats(limit);
      break;
    }
  }
}

// İzlemeyi durdur
function stopWatcher(analysisId, limit) {
  // İzleyiciyi bul ve durdur
  const watcherId = `${getAnalysisFromTable(analysisId, limit)?.symbol || ''}-${analysisId}`;
  
  if (activeWatchers[watcherId]) {
    clearInterval(activeWatchers[watcherId]);
    delete activeWatchers[watcherId];
    
    // Analiz objesini al
    const analysis = getAnalysisFromTable(analysisId, limit);
    
    if (analysis) {
      // Aktif analiz bayrağını kaldır
      const limitKey = `${analysis.symbol}-${limit}`;
      delete activeAnalysisFlags[limitKey];
      
      // Siqnal jurnalına əlavə et (sonlandırıldı)
      logSignal(analysis.signal, analysis, 'CANCELED');
    }
    
    // Tabloyu güncelle
    const tableBodyId = LIMITS[limit].tableBodyId;
    const rows = document.getElementById(tableBodyId).querySelectorAll('tr');
    
    for (let row of rows) {
      if (row.getAttribute('data-id') === analysisId) {
        row.setAttribute('data-active', 'false');
        break;
      }
    }
    
    // İstatistikleri güncelle
    updateTableStats(limit);
  }
}

// Analiz objesini tablodan al
function getAnalysisFromTable(analysisId, limit) {
  const tableBodyId = LIMITS[limit].tableBodyId;
  const rows = document.getElementById(tableBodyId).querySelectorAll('tr');
  
  for (let row of rows) {
    if (row.getAttribute('data-id') === analysisId) {
      return {
        id: analysisId,
        symbol: row.getAttribute('data-symbol'),
        signal: row.getAttribute('data-signal'),
        entryPrice: parseFloat(row.getAttribute('data-entry-price')),
        currentPrice: parseFloat(row.getAttribute('data-current-price')),
        takeProfit: parseFloat(row.getAttribute('data-tp')),
        stopLoss: parseFloat(row.getAttribute('data-sl')),

        result: row.getAttribute('data-result'),
        startTime: parseInt(row.getAttribute('data-start-time')),
        isActive: row.getAttribute('data-active') === 'true'
      };
    }
  }
  
  return null;
}

// İzleyiciyi yeniden başlat
function restartWatcher(id, limit) {
  const tableBodyId = LIMITS[limit].tableBodyId;
  const row = document.getElementById(tableBodyId).querySelector(`tr[data-id="${id}"]`);
  
  if (row) {
    const analysis = {
      id,
      symbol: row.getAttribute('data-symbol'),
      signal: row.getAttribute('data-signal'),
      entryPrice: parseFloat(row.getAttribute('data-entry-price')),
      currentPrice: parseFloat(row.getAttribute('data-current-price')),
      takeProfit: parseFloat(row.getAttribute('data-tp')),
      stopLoss: parseFloat(row.getAttribute('data-sl')),

      result: 'Bekleniyor',
      startTime: Date.now(),
      isActive: true
    };
    
    // Satırı güncelle
    row.setAttribute('data-result', 'Bekleniyor');
    row.setAttribute('data-active', 'true');
    row.setAttribute('data-start-time', analysis.startTime);
    
    const resultCell = row.querySelector('.result');
    if (resultCell) {
      resultCell.textContent = 'Bekleniyor';
      resultCell.className = 'result waiting';
    }
    
    const startTimeCell = row.querySelector('td:nth-child(8)'); // Son sütun (SL yüzdesi sütunu kaldırıldı)
    if (startTimeCell) {
      startTimeCell.textContent = new Date(analysis.startTime).toLocaleTimeString();
    }
    
    const actionCell = row.querySelector('td:last-child');
    if (actionCell) {
      actionCell.innerHTML = `<button class="stop-btn" onclick="stopWatcher('${id}', '${limit}')">Durdur</button>`;
    }
    
    // İzleyiciyi başlat
    startWatcher(analysis, limit);
    
    // localStorage'a kaydet
    saveToStorage(limit);
    
    updateStatus(`${analysis.symbol} için ${limit} mum analizinde izleme yeniden başlatıldı.`);
  }
}

// Tüm analizleri temizle
function clearAllAnalyses() {
  if (confirm('Tüm analizleri silmek istediğinizden emin misiniz?')) {
    // İzleme işlemlerini temizle
    for (const watcherId in activeWatchers) {
      clearInterval(activeWatchers[watcherId]);
    }
    activeWatchers = {};
    
    // NoSignal zamanlayıcılarını temizle
    for (const key in noSignalTimers) {
      clearTimeout(noSignalTimers[key]);
    }
    noSignalTimers = {};
    
    // Sinyal sayaçlarını sıfırla
    noSignalCounters = {};
    
    // Aktif analiz bayraklarını temizle
    activeAnalysisFlags = {};
    
    // Her limit için tabloları temizle
    for (const limit in LIMITS) {
      const tableBodyId = LIMITS[limit].tableBodyId;
      document.getElementById(tableBodyId).innerHTML = '';
      
      // Tablo başlığındaki Sinyal Yok bilgisini kaldır
      const cardHeader = document.querySelector(`#${tableBodyId}`).closest('.card').querySelector('.card-header h2');
      if (cardHeader) {
        const existingMsg = cardHeader.querySelector('.no-signal-msg');
        if (existingMsg) {
          existingMsg.remove();
        }
      }
      
      // localStorage'ı temizle
      localStorage.removeItem(LIMITS[limit].key);
      
      // İstatistikleri güncelle
      updateTableStats(limit);
    }
    
    // Siqnal jurnalını saxlamaq istədiyini soruş
    if (confirm('Siqnal jurnalını silmək istəyirsiniz? İptal seçilsə jurnal saxlanacaq.')) {
      // Siqnal jurnalını sıfırla
      signalLog = [];
      localStorage.removeItem(SIGNAL_LOG_FILE);
    }
    
    updateStatus('Tüm analizler temizlendi.');
    
    // Statistikanı göstər
    showSignalStatistics();
  }
}

// Aktif izleyicileri yeniden başlat
function restartActiveWatchers() {
  // Her limit için aktif izleyicileri yeniden başlat
  for (const limit in LIMITS) {
    const tableBodyId = LIMITS[limit].tableBodyId;
    const analyses = getAnalysesFromTable(tableBodyId);
    
    analyses.forEach(analysis => {
      if (analysis.isActive) {
        startWatcher(analysis, limit);
      }
    });
  }
  
  updateStatus('Aktif izlemeler yeniden başlatıldı.');
}

// Durum mesajını güncelle
function updateStatus(message) {
  statusContainer.textContent = message;
}

// Global fonksiyonları erişilebilir yap
window.stopWatcher = stopWatcher;
window.restartWatcher = restartWatcher; 

// İndikator göstəriciləri panelini yenilə
function updateIndicatorPanel(symbol, analysisResult) {
  // Analiz nəticəsi yoxdursa heç bir şey etmə
  if (!analysisResult) {
    return;
  }
  
  // Qiymətləri formatla
  const formatValue = (value) => {
    if (typeof value === 'number') {
      // İfrat kiçik qiymətləri daha oxunaqlı formata çevir
      if (value < 0.0001) {
        return value.toExponential(4);
      }
      
      // 0-100 arası dəyərlər üçün
      if (value > 0 && value < 100) {
        return value.toFixed(2);
      }
      
      // Qiymət üçün
      return value.toFixed(6);
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Var' : 'Yox';
    }
    
    return value || '-';
  };
  
  // Qiymətləri yenilə
  document.getElementById('ema9Value').textContent = formatValue(analysisResult.ema9);
  document.getElementById('ema21Value').textContent = formatValue(analysisResult.ema21);
  
  // Volume və Order Book göstəriciləri
  const volumeElement = document.getElementById('volumeValue');
  if (volumeElement) {
    const volumeValue = analysisResult.volumeIncreased ? 'Var ✅' : 'Yox ❌';
    volumeElement.textContent = volumeValue;
    volumeElement.className = analysisResult.volumeIncreased ? 'indicator-value LONG' : 'indicator-value';
  }
  
  const orderBookElement = document.getElementById('orderBookValue');
  if (orderBookElement) {
    const orderBookValue = analysisResult.orderBookSupport ? 'Var ✅' : 'Yox ❌';
    orderBookElement.textContent = orderBookValue;
    orderBookElement.className = analysisResult.orderBookSupport ? 'indicator-value LONG' : 'indicator-value';
  }
  
  // Score dəyərləri əlavə et
  const longScoreElement = document.getElementById('longScoreValue');
  if (longScoreElement) {
    longScoreElement.textContent = formatValue(analysisResult.longScore);
  }
  
  const shortScoreElement = document.getElementById('shortScoreValue');
  if (shortScoreElement) {
    shortScoreElement.textContent = formatValue(analysisResult.shortScore);
  }
  
  // Səbəblər yazı
  const reasonElement = document.getElementById('signalReasonValue');
  if (reasonElement) {
    reasonElement.textContent = analysisResult.reasons || 'Siqnal yoxdur';
  }
  
  // Xal detaylarını göstər
  const pointsDetailsElement = document.getElementById('pointsDetails');
  if (pointsDetailsElement) {
    // Siqnal tipinə görə aktiv xalları müəyyənləşdir
    const signalType = analysisResult.signal;
    
    // Xal məlumatlarını hazırla
    let pointsHTML = '';
    
    if (signalType === 'LONG' || signalType === 'SHORT') {
      // İndikatör vəziyyətləri və müvafiq xallar
      const points = [
        {
          name: signalType === 'LONG' ? 'EMA(9) > EMA(21)' : 'EMA(9) < EMA(21)',
          value: 1,
          isActive: signalType === 'LONG' ? analysisResult.ema9 > analysisResult.ema21 : analysisResult.ema9 < analysisResult.ema21
        },
        {
          name: 'Volume Spike',
          value: 2,
          isActive: analysisResult.volumeIncreased
        },
        {
          name: signalType === 'LONG' ? 'Buy Wall' : 'Sell Wall',
          value: 2,
          isActive: analysisResult.orderBookSupport
        }
      ];
      
      // Hər bir xal üçün HTML yarat
      points.forEach(point => {
        const activeClass = point.isActive ? 'active' : '';
        const directionClass = signalType === 'LONG' ? 'long' : 'short';
        const valueClass = point.isActive ? 'positive' : 'negative';
        
        pointsHTML += `
          <div class="point-item ${activeClass} ${point.isActive ? directionClass : ''}">
            <span class="point-name">${point.name}</span>
            <span class="point-value ${valueClass}">${point.isActive ? '+' : ''}${point.value} xal</span>
          </div>
        `;
      });
      
      // Ümumi xal
      const totalScore = signalType === 'LONG' ? analysisResult.longScore : analysisResult.shortScore;
      const minScoreThreshold = MIN_SCORE_THRESHOLD;
      
      pointsHTML += `
        <div class="point-item active ${signalType.toLowerCase()}">
          <span class="point-name"><strong>Cəmi Xal</strong></span>
          <span class="point-value positive">${totalScore} / ${minScoreThreshold}</span>
        </div>
      `;
    } else {
      // Siqnal yoxdursa
      pointsHTML = '<div class="no-points">Aktiv siqnal mövcud deyil</div>';
    }
    
    // HTML-i əlavə et
    pointsDetailsElement.innerHTML = pointsHTML;
  }
  
  // Bazar vəziyyəti
  const marketStateElement = document.getElementById('marketStateValue');
  if (marketStateElement) {
    marketStateElement.textContent = analysisResult.marketState || '-';
    
    // Vəziyyətə görə sinif təyin et
    if (analysisResult.marketState === 'STRONG_TREND') {
      marketStateElement.className = 'indicator-value STRONG-TREND';
    } else if (analysisResult.marketState === 'WEAK_TREND') {
      marketStateElement.className = 'indicator-value WEAK-TREND';
    } else if (analysisResult.marketState === 'FLAT') {
      marketStateElement.className = 'indicator-value FLAT';
    } else {
      marketStateElement.className = 'indicator-value';
    }
  }
}

// Order book'dan support/resistance yoxlama funksiyası (simulyasiya)
function checkOrderBookSupport(symbol, price, direction) {
  try {
    // Gerçək tətbiqdə burada exchange API-dən market depth məlumatları alınmalıdır
    // Bu nümunədə sadəcə simulyasiya olunur
    
    // Simulyasiya məqsədləri üçün 30% ehtimalla support/resistance var deyirik
    const hasWall = Math.random() > 0.7;
    
    // LONG əməliyyat üçün support, SHORT əməliyyat üçün resistance axtarırıq
    if (direction === 'LONG') {
      return hasWall;  // Support wall simulyasiyası
    } else {
      return hasWall;  // Resistance wall simulyasiyası
    }
  } catch (error) {
    console.error('Order book yoxlanışı zamanı xəta:', error);
    return false;
  }
}

// Trend vəziyyətini təyin et
function detectMarketState(closePrices, volumeData) {
  try {
    if (closePrices.length < TREND_DETECTION_PERIOD) {
      return "UNKNOWN";
    }
    
    // Son qiymətlər
    const recentPrices = closePrices.slice(-TREND_DETECTION_PERIOD);
    
    // Standart sapma hesabla - volatilliyi ölçmək üçün
    const avg = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - avg, 2), 0) / recentPrices.length;
    const stdDev = Math.sqrt(variance);
    
    // Qiymət hərəkətini hesabla
    const priceChange = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100;
    
    // Həcm dəyişikliyini ölç
    const avgVolume = volumeData.slice(-TREND_DETECTION_PERIOD).reduce((sum, vol) => sum + vol, 0) / TREND_DETECTION_PERIOD;
    const recentVolume = volumeData.slice(-5).reduce((sum, vol) => sum + vol, 0) / 5;
    const volumeChangeRatio = recentVolume / avgVolume;
    
    // Güclü trend: Böyük qiymət dəyişikliyi + yüksək stdDev + yüksək həcm
    if (Math.abs(priceChange) > 2 && stdDev > avg * 0.015 && volumeChangeRatio > 1.2) {
      return "STRONG_TREND";
    }
    // Zəif trend: Orta səviyyəli qiymət dəyişikliyi
    else if (Math.abs(priceChange) > 0.8 && stdDev > avg * 0.008) {
      return "WEAK_TREND";
    }
    // Flat: Kiçik qiymət dəyişikliyi və aşağı volatillik  
    else {
      return "FLAT";
    }
  } catch (error) {
    console.error('Bazar vəziyyətini təyin edərkən xəta:', error);
    return "UNKNOWN";
  }
}

// Siqnal jurnalına əlavə et
function logSignal(signal, analysis, result = null) {
  const signalInfo = {
    timestamp: Date.now(),
    symbol: analysis.symbol,
    signal: signal,
    entryPrice: analysis.entryPrice,
    takeProfit: analysis.takeProfit,
    stopLoss: analysis.stopLoss,
    result: result || 'Bekleniyor',
    timeframe: `${CANDLE_INTERVAL}`,
    indicators: {
      ema9: analysis.analysis?.ema9,
      ema21: analysis.analysis?.ema21,
      volumeIncreased: analysis.analysis?.volumeIncreased,
      orderBookSupport: analysis.analysis?.orderBookSupport
    },
    marketState: analysis.analysis?.marketState,
    scores: {
      long: analysis.analysis?.longScore,
      short: analysis.analysis?.shortScore
    },
    reasons: analysis.analysis?.reasons
  };
  
  // Jurnal massivinə əlavə et
  signalLog.push(signalInfo);
  
  // Jurnal faylına yaz
  try {
    localStorage.setItem(SIGNAL_LOG_FILE, JSON.stringify(signalLog));
  } catch (error) {
    console.error('Siqnal jurnalını saxlayarkən xəta:', error);
  }
  
  return signalInfo;
}

// Jurnaldan siqnal statistikasını analiz et
function analyzeSignalStatistics() {
  try {
    let signalData = JSON.parse(localStorage.getItem(SIGNAL_LOG_FILE) || '[]');
    
    // Boşdursa, hələ heç bir jurnal yoxdur
    if (signalData.length === 0) {
      return {
        totalSignals: 0,
        winRate: 0,
        longWinRate: 0,
        shortWinRate: 0,
        topIndicators: [],
        bestMarketState: 'UNKNOWN'
      };
    }
    
    // Tamamlanmış siqnalları filterlə
    const completedSignals = signalData.filter(signal => 
      signal.result === 'TP' || signal.result === 'SL'
    );
    
    // Statistik nəticələri hesabla
    const totalSignals = completedSignals.length;
    const tpSignals = completedSignals.filter(signal => signal.result === 'TP').length;
    const winRate = totalSignals > 0 ? (tpSignals / totalSignals) * 100 : 0;
    
    // LONG və SHORT statistikası
    const longSignals = completedSignals.filter(signal => signal.signal === 'LONG');
    const shortSignals = completedSignals.filter(signal => signal.signal === 'SHORT');
    
    const longWins = longSignals.filter(signal => signal.result === 'TP').length;
    const shortWins = shortSignals.filter(signal => signal.result === 'TP').length;
    
    const longWinRate = longSignals.length > 0 ? (longWins / longSignals.length) * 100 : 0;
    const shortWinRate = shortSignals.length > 0 ? (shortWins / shortSignals.length) * 100 : 0;
    
    // Ən uğurlu bazar vəziyyəti
    const marketStates = {};
    completedSignals.forEach(signal => {
      const state = signal.marketState || 'UNKNOWN';
      if (!marketStates[state]) {
        marketStates[state] = { total: 0, wins: 0 };
      }
      marketStates[state].total++;
      if (signal.result === 'TP') {
        marketStates[state].wins++;
      }
    });
    
    let bestMarketState = 'UNKNOWN';
    let bestWinRate = 0;
    
    Object.keys(marketStates).forEach(state => {
      const stateData = marketStates[state];
      const stateWinRate = stateData.total > 0 ? (stateData.wins / stateData.total) * 100 : 0;
      if (stateWinRate > bestWinRate && stateData.total >= 5) { // Ən azı 5 siqnal
        bestWinRate = stateWinRate;
        bestMarketState = state;
      }
    });
    
    // Ən uğurlu indikator kombinasiyaları
    // Sadəcə reason əsasında analiz edirik
    const reasonStats = {};
    
    completedSignals.forEach(signal => {
      if (!signal.reasons) return;
      
      const reasons = signal.reasons.split(';').map(r => r.trim());
      reasons.forEach(reason => {
        if (!reasonStats[reason]) {
          reasonStats[reason] = { total: 0, wins: 0 };
        }
        reasonStats[reason].total++;
        if (signal.result === 'TP') {
          reasonStats[reason].wins++;
        }
      });
    });
    
    // Ən uğurlu indikatorları sırala
    const topIndicators = Object.keys(reasonStats)
      .filter(reason => reasonStats[reason].total >= 5) // Ən azı 5 siqnal
      .map(reason => ({
        reason,
        winRate: (reasonStats[reason].wins / reasonStats[reason].total) * 100,
        total: reasonStats[reason].total
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5); // Top 5 indikator
    
    return {
      totalSignals,
      winRate,
      longWinRate,
      shortWinRate,
      topIndicators,
      bestMarketState
    };
  } catch (error) {
    console.error('Siqnal statistikasını analiz edərkən xəta:', error);
    return {
      error: error.message
    };
  }
}

// Point-based score ilə analiz et - Təkmilləşdirilmiş versiya
function analyzeMarketWithScore(symbol, candles, timeframeMinutes = 3) {
  try {
    if (!candles || !Array.isArray(candles) || candles.length < 10) {
      throw new Error(`${symbol} üçün kifayət qədər mum məlumatı yoxdur`);
    }
    
    // Qiymət və həcm məlumatlarını hazırla
    const closePrices = candles.map(candle => candle.close);
    const volumes = candles.map(candle => candle.volume);
    
    // İndikatorları hesabla
    const ema9 = calculateEMA(closePrices, 9);
    const ema21 = calculateEMA(closePrices, 21);
    
    // Son dəyərlər
    const lastCandle = candles[candles.length - 1];
    const lastClose = lastCandle.close;
    const lastEMA9 = ema9[ema9.length - 1];
    const lastEMA21 = ema21[ema21.length - 1];
    
    // Bazar vəziyyətini təyin et
    const marketState = detectMarketState(closePrices, volumes);
    
    // Həcm artışını yoxla
    const recentVolumes = volumes.slice(-6, -1); // Son şamdan öncəki 5 şam
    const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
    const volumeIncreased = lastCandle.volume > avgVolume * 1.2; // 20% artım
    
    // Xal hesablama - yeni sadələşdirilmiş sistem
    let longScore = 0;
    let shortScore = 0;
    let longReasons = [];
    let shortReasons = [];
    
    // ================ LONG SIQNALI ================
    // EMA göstəricisi - EMA9 > EMA21 → +1 xal
    if (lastEMA9 > lastEMA21) {
      longScore += 1;
      longReasons.push("EMA(9) > EMA(21)");
    }
    
    // Volume spike → +2 xal
    if (volumeIncreased) {
      longScore += 2;
      longReasons.push("Volume spike");
    }
    
    // Buy Wall mövcuddursa → +2 xal
    if (checkOrderBookSupport(symbol, lastClose, "LONG")) {
      longScore += 2;
      longReasons.push("Buy Wall mövcuddur");
    }

    // ================ SHORT SIQNALI ================
    // EMA göstəricisi - EMA9 < EMA21 → +1 xal
    if (lastEMA9 < lastEMA21) {
      shortScore += 1;
      shortReasons.push("EMA(9) < EMA(21)");
    }
    
    // Volume spike → +2 xal
    if (volumeIncreased) {
      shortScore += 2;
      shortReasons.push("Volume spike");
    }
    
    // Sell Wall mövcuddursa → +2 xal
    if (checkOrderBookSupport(symbol, lastClose, "SHORT")) {
      shortScore += 2;
      shortReasons.push("Sell Wall mövcuddur");
    }
    
    // Siqnalı müəyyənləşdir - Əgər toplam xal ≥ 2-dürsə, mövqe açılır (HIZLI İŞLEM)
    let signal = null;
    
    if (longScore >= MIN_SCORE_THRESHOLD) {
      signal = "LONG";
    } 
    else if (shortScore >= MIN_SCORE_THRESHOLD) {
      signal = "SHORT";
    }
    
    // Nəticəni qaytar
    return {
      signal,
      longScore,
      shortScore,
      ema9: lastEMA9,
      ema21: lastEMA21,
      marketState,
      volumeIncreased,
      orderBookSupport: checkOrderBookSupport(symbol, lastClose, signal || "LONG"),
      reasons: signal === "LONG" ? longReasons.join("; ") : (signal === "SHORT" ? shortReasons.join("; ") : "")
    };
  } catch (error) {
    console.error('Market analizi zamanı xəta:', error);
    return {
      signal: null,
      longScore: 0,
      shortScore: 0,
      error: error.message
    };
  }
}

// Support və Resistance səviyyələrini hesabla
function calculateSupportResistanceLevels(candles, lookbackPeriod = BREAKOUT_LOOKBACK_PERIOD) {
  if (candles.length < lookbackPeriod) {
    return { supportLevels: [], resistanceLevels: [] };
  }
  
  const recentCandles = candles.slice(-lookbackPeriod);
  
  let potentialSupports = [];
  let potentialResistances = [];
  
  // Pivotları tapmaq üçün şamları analiz et (local minimums and maximums)
  for (let i = 2; i < recentCandles.length - 2; i++) {
    // Support - local minimum
    if (recentCandles[i].low < recentCandles[i-1].low && 
        recentCandles[i].low < recentCandles[i-2].low && 
        recentCandles[i].low < recentCandles[i+1].low && 
        recentCandles[i].low < recentCandles[i+2].low) {
      
      potentialSupports.push({
        price: recentCandles[i].low,
        strength: 1, // Başlanğıc gücü
        time: recentCandles[i].openTime
      });
    }
    
    // Resistance - local maximum
    if (recentCandles[i].high > recentCandles[i-1].high && 
        recentCandles[i].high > recentCandles[i-2].high && 
        recentCandles[i].high > recentCandles[i+1].high && 
        recentCandles[i].high > recentCandles[i+2].high) {
      
      potentialResistances.push({
        price: recentCandles[i].high,
        strength: 1, // Başlanğıc gücü
        time: recentCandles[i].openTime
      });
    }
  }
  
  // Eyni səviyyədəki təkrarlanan nöqtələri birləşdirərək güc hesabla
  let combinedSupports = [];
  let combinedResistances = [];
  
  // Support səviyyələri üçün birləşdirmə
  potentialSupports.forEach(support => {
    // Qiymət toleransı - cari qiymətin 0.1%
    const tolerance = support.price * 0.001; 
    
    // Mövcud birləşdirilmiş səviyyələrdə bu səviyyəyə yaxın olan var mı?
    const existingIndex = combinedSupports.findIndex(s => 
      Math.abs(s.price - support.price) <= tolerance
    );
    
    if (existingIndex !== -1) {
      // Mövcud səviyyəni yenilə - gücünü artır
      combinedSupports[existingIndex].strength += 1;
    } else {
      // Yeni səviyyə əlavə et
      combinedSupports.push(support);
    }
  });
  
  // Resistance səviyyələri üçün birləşdirmə
  potentialResistances.forEach(resistance => {
    // Qiymət toleransı - cari qiymətin 0.1%
    const tolerance = resistance.price * 0.001; 
    
    // Mövcud birləşdirilmiş səviyyələrdə bu səviyyəyə yaxın olan var mı?
    const existingIndex = combinedResistances.findIndex(r => 
      Math.abs(r.price - resistance.price) <= tolerance
    );
    
    if (existingIndex !== -1) {
      // Mövcud səviyyəni yenilə - gücünü artır
      combinedResistances[existingIndex].strength += 1;
    } else {
      // Yeni səviyyə əlavə et
      combinedResistances.push(resistance);
    }
  });
  
  // Gücə görə sırala
  combinedSupports.sort((a, b) => b.strength - a.strength);
  combinedResistances.sort((a, b) => b.strength - a.strength);
  
  // Ən güclü 3 səviyyəni qaytarın
  return {
    supportLevels: combinedSupports.slice(0, 3),
    resistanceLevels: combinedResistances.slice(0, 3)
  };
}

// Breakout siqnalı yoxla
function checkBreakout(candles, threshold = BREAKOUT_THRESHOLD, confirmationCandles = BREAKOUT_CONFIRMATION_CANDLES) {
  if (candles.length < BREAKOUT_LOOKBACK_PERIOD + confirmationCandles) {
    return { signal: null, level: null, strength: 0 };
  }
  
  // Son şamlar
  const currentCandles = candles.slice(-confirmationCandles);
  
  // Support/Resistance səviyyələri - son şamlardan əvvəlki perioddan hesablayın
  const levelCandles = candles.slice(-(BREAKOUT_LOOKBACK_PERIOD + confirmationCandles), -confirmationCandles);
  const { supportLevels, resistanceLevels } = calculateSupportResistanceLevels(levelCandles);
  
  // Breakout üçün qiymət dəyişikliyi həddi
  const thresholdPercent = threshold / 100;
  
  // Support qırılması - SHORT siqnalı
  for (const support of supportLevels) {
    // Bütün confirmation şamlar support səviyyəsindən aşağıdır?
    if (currentCandles.every(candle => candle.close < support.price * (1 - thresholdPercent))) {
      // Support qırılmışdır - SHORT siqnalı
      return {
        signal: "SHORT",
        level: support.price,
        strength: support.strength,
        reason: `Support qırılması (${support.price.toFixed(4)})`
      };
    }
  }
  
  // Resistance qırılması - LONG siqnalı
  for (const resistance of resistanceLevels) {
    // Bütün confirmation şamlar resistance səviyyəsindən yuxarıdır?
    if (currentCandles.every(candle => candle.close > resistance.price * (1 + thresholdPercent))) {
      // Resistance qırılmışdır - LONG siqnalı
      return {
        signal: "LONG",
        level: resistance.price,
        strength: resistance.strength,
        reason: `Resistance qırılması (${resistance.price.toFixed(4)})`
      };
    }
  }
  
  // Breakout yoxdur
  return { signal: null, level: null, strength: 0 };
}

// Parabolic SAR hesabla
function calculatePSAR(candles, acceleration = SAR_ACCELERATION, maxAcceleration = SAR_MAXIMUM, afIncrement = SAR_AF_INCREMENT) {
  if (candles.length < 3) {
    return {
      psar: [],
      direction: null,
      reversal: false
    };
  }
  
  let psar = [];
  let direction = null; // "up" or "down"
  let ep = null; // Extreme Point
  let af = acceleration; // Acceleration Factor
  
  // İlk istiqaməti təyin et
  if (candles[1].close > candles[0].close) {
    direction = "up";
    psar.push(candles[0].low); // İlkin SAR dəyəri - ilk şamın minimumu
    ep = candles[1].high; // İlkin extreme point - ikinci şamın maksimumu
  } else {
    direction = "down";
    psar.push(candles[0].high); // İlkin SAR dəyəri - ilk şamın maksimumu
    ep = candles[1].low; // İlkin extreme point - ikinci şamın minimumu
  }
  
  // İkinci SAR dəyəri - ilk SAR + AF * (EP - ilk SAR)
  const secondSAR = psar[0] + af * (ep - psar[0]);
  psar.push(secondSAR);
  
  // Qalan şamlar üçün SAR hesabla
  let reversalPoints = [];
  
  for (let i = 2; i < candles.length; i++) {
    let currentSAR = psar[i-1];
    let prevSAR = psar[i-2];
    let reversal = false;
    
    if (direction === "up") {
      // Yüksələn trend - SAR şamın altındadır
      
      // SAR aşağı həddə məhdudlaşdırılır
      currentSAR = Math.min(currentSAR, candles[i-1].low, candles[i-2].low);
      
      // Əgər cari şam SAR-ın altına düşərsə, trend dönür
      if (candles[i].low < currentSAR) {
        direction = "down";
        currentSAR = ep; // EP yeni SAR olur
        ep = candles[i].low; // Yeni EP şamın minimumu olur
        af = acceleration; // AF sıfırlanır
        reversal = true;
        reversalPoints.push(i);
      } else {
        // Trend davam edir
        // Əgər yeni high varsa, EP yenilənir və AF artırılır
        if (candles[i].high > ep) {
          ep = candles[i].high;
          af = Math.min(af + afIncrement, maxAcceleration);
        }
        
        // Növbəti SAR hesablanır
        currentSAR = prevSAR + af * (ep - prevSAR);
      }
    } else {
      // Enən trend - SAR şamın üstündədir
      
      // SAR yuxarı həddə məhdudlaşdırılır
      currentSAR = Math.max(currentSAR, candles[i-1].high, candles[i-2].high);
      
      // Əgər cari şam SAR-dan yüksəyə qalxarsa, trend dönür
      if (candles[i].high > currentSAR) {
        direction = "up";
        currentSAR = ep; // EP yeni SAR olur
        ep = candles[i].high; // Yeni EP şamın maksimumu olur
        af = acceleration; // AF sıfırlanır
        reversal = true;
        reversalPoints.push(i);
      } else {
        // Trend davam edir
        // Əgər yeni low varsa, EP yenilənir və AF artırılır
        if (candles[i].low < ep) {
          ep = candles[i].low;
          af = Math.min(af + afIncrement, maxAcceleration);
        }
        
        // Növbəti SAR hesablanır
        currentSAR = prevSAR + af * (ep - prevSAR);
      }
    }
    
    psar.push(currentSAR);
  }
  
  // Son trendin istiqaməti və dönüş olub-olmadığını qaytarın
  const lastReversal = reversalPoints.length > 0 ? 
    reversalPoints[reversalPoints.length - 1] === candles.length - 1 : false;
  
  return {
    psar: psar,
    direction: direction,
    reversal: lastReversal
  };
}

// ------ CANDLESTICK PATTERN FUNCTIONS ------

// Candle body və shadow uzunluqlarını hesabla
function getCandleProperties(candle) {
  const bodySize = Math.abs(candle.close - candle.open);
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const totalSize = candle.high - candle.low;
  
  return {
    bodySize,
    upperShadow,
    lowerShadow,
    totalSize,
    isBullish: candle.close > candle.open,
    isBearish: candle.close < candle.open
  };
}

// Engulfing Pattern tanı
function detectEngulfing(candles) {
  if (candles.length < 2) return { pattern: null, strength: 0 };
  
  const current = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  
  const currProps = getCandleProperties(current);
  const prevProps = getCandleProperties(prev);
  
  // Bullish Engulfing - əvvəlki şam qırmızı, cari şam yaşıl
  if (prevProps.isBearish && currProps.isBullish &&
      current.open < prev.close &&
      current.close > prev.open) {
    
    // Şamın gücünü hesabla - nə qədər böyük engulfing, o qədər güclü
    const engulfingSize = currProps.bodySize / prevProps.bodySize;
    const strength = Math.min(engulfingSize / 2, 1);
    
    return {
      pattern: 'BULLISH_ENGULFING',
      signal: 'LONG',
      strength,
      reason: 'Bullish Engulfing Pattern'
    };
  }
  
  // Bearish Engulfing - əvvəlki şam yaşıl, cari şam qırmızı
  if (prevProps.isBullish && currProps.isBearish &&
      current.open > prev.close &&
      current.close < prev.open) {
    
    // Şamın gücünü hesabla - nə qədər böyük engulfing, o qədər güclü
    const engulfingSize = currProps.bodySize / prevProps.bodySize;
    const strength = Math.min(engulfingSize / 2, 1);
    
    return {
      pattern: 'BEARISH_ENGULFING',
      signal: 'SHORT',
      strength,
      reason: 'Bearish Engulfing Pattern'
    };
  }
  
  return { pattern: null, strength: 0 };
}

// Doji Pattern tanı
function detectDoji(candles) {
  if (candles.length < 1) return { pattern: null, strength: 0 };
  
  const current = candles[candles.length - 1];
  const props = getCandleProperties(current);
  
  // Body çox kiçik olmalıdır
  const bodyToTotalRatio = props.bodySize / props.totalSize;
  
  if (bodyToTotalRatio < 0.1) {
    // Doğru formada shadow olmalıdır
    if (props.upperShadow > 0 && props.lowerShadow > 0) {
      
      // Pattern gücünü hesabla
      const shadows = props.upperShadow + props.lowerShadow;
      const strength = Math.min(shadows / props.totalSize, 1);
      
      let dojiType = 'DOJI'; 
      let signal = null;
      
      // Dragonfly Doji (alt shadow uzundur)
      if (props.lowerShadow > 3 * props.upperShadow) {
        dojiType = 'DRAGONFLY_DOJI';
        signal = 'LONG';
      } 
      // Gravestone Doji (üst shadow uzundur)
      else if (props.upperShadow > 3 * props.lowerShadow) {
        dojiType = 'GRAVESTONE_DOJI';
        signal = 'SHORT';
      }
      // Long-Legged Doji (hər iki shadow uzundur)
      else {
        // Əvvəlki şamlara görə siqnal təyin edəcəyik
        if (candles.length >= 3) {
          // Son 2 şam yüksəlibsə, doji nöqtəsi - SHORT siqnalı
          if (candles[candles.length-2].close > candles[candles.length-3].close) {
            signal = 'SHORT';
          } 
          // Son 2 şam enibsə, doji nöqtəsi - LONG siqnalı 
          else if (candles[candles.length-2].close < candles[candles.length-3].close) {
            signal = 'LONG';
          }
        }
      }
      
      return {
        pattern: dojiType,
        signal: signal,
        strength: signal ? strength : 0,
        reason: `${dojiType.replace('_', ' ')} Pattern`
      };
    }
  }
  
  return { pattern: null, strength: 0 };
}

// Hammer Pattern tanı
function detectHammer(candles) {
  if (candles.length < 1) return { pattern: null, strength: 0 };
  
  const current = candles[candles.length - 1];
  const props = getCandleProperties(current);
  
  // Body və shadow proporsiyalarını hesabla
  const bodyToTotalRatio = props.bodySize / props.totalSize;
  const lowerShadowToBodyRatio = props.lowerShadow / props.bodySize;
  const upperShadowToBodyRatio = props.upperShadow / props.bodySize;
  
  // Hammer və Shooting Star vəziyyətlərini yoxla
  if (bodyToTotalRatio <= 0.4) {  // Body kiçik olmalıdır
    // Hammer pattern (alt shadow çox uzun)
    if (lowerShadowToBodyRatio >= 2 && upperShadowToBodyRatio < 0.2) {
      // Trend yoxla - yalnız enən trenddən sonra Hammer siqnalı LONG-dur
      const strength = Math.min(lowerShadowToBodyRatio / 3, 1);
      
      return {
        pattern: 'HAMMER',
        signal: 'LONG',
        strength,
        reason: 'Hammer Pattern: Alt shadow qarşılaşdırma nöqtəsi'
      };
    }
    
    // Shooting Star (üst shadow çox uzun)
    if (upperShadowToBodyRatio >= 2 && lowerShadowToBodyRatio < 0.2) {
      // Trend yoxla - yalnız yüksələn trenddən sonra Shooting Star siqnalı SHORT-dur
      const strength = Math.min(upperShadowToBodyRatio / 3, 1);
      
      return {
        pattern: 'SHOOTING_STAR',
        signal: 'SHORT',
        strength,
        reason: 'Shooting Star Pattern: Üst shadow qarşılaşdırma nöqtəsi'
      };
    }
  }
  
  return { pattern: null, strength: 0 };
}

// Bütün pattern-ləri yoxla və ən güclü siqnalı qaytar
function detectCandlePatterns(candles) {
  if (candles.length < 3) return { pattern: null, signal: null, strength: 0 };
  
  // Bütün pattern analiz nəticələri
  const engulfing = detectEngulfing(candles);
  const doji = detectDoji(candles);
  const hammer = detectHammer(candles);
  
  // Bütün pattern siqnalları
  const patterns = [engulfing, doji, hammer].filter(p => p.pattern && p.strength >= PATTERN_STRENGTH_THRESHOLD);
  
  // Siqnalı olmayan və gücü yetərli olmayan pattern-ləri filtrələ
  const validPatterns = patterns.filter(p => p.signal && p.strength >= PATTERN_STRENGTH_THRESHOLD);
  
  if (validPatterns.length === 0) {
    return { pattern: null, signal: null, strength: 0 };
  }
  
  // Ən güclü pattern-i tap
  const strongestPattern = validPatterns.reduce((max, current) => 
    current.strength > max.strength ? current : max
  , { strength: 0 });
  
  return strongestPattern;
}

// ADX hesablama
function calculateADX(candles, period = ADX_PERIOD) {
  if (candles.length < period * 2) {
    return {
      adx: [],
      pdi: [],
      mdi: []
    };
  }
  
  // TR, +DM, -DM hesabla
  const trueRanges = [];
  const plusDMs = [];
  const minusDMs = [];
  
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i-1].high;
    const prevLow = candles[i-1].low;
    
    // TR = max(high-low, |high-prevClose|, |low-prevClose|)
    const tr = Math.max(
      high - low,
      Math.abs(high - candles[i-1].close),
      Math.abs(low - candles[i-1].close)
    );
    
    // +DM və -DM hesabla
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    let plusDM = 0;
    let minusDM = 0;
    
    if (upMove > downMove && upMove > 0) {
      plusDM = upMove;
    }
    
    if (downMove > upMove && downMove > 0) {
      minusDM = downMove;
    }
    
    trueRanges.push(tr);
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }
  
  // Smoothed TR, +DM, -DM
  const smoothedTR = [];
  const smoothedPlusDM = [];
  const smoothedMinusDM = [];
  
  // İlk dəyərlər
  let firstTR = 0;
  let firstPlusDM = 0;
  let firstMinusDM = 0;
  
  for (let i = 0; i < period; i++) {
    firstTR += trueRanges[i];
    firstPlusDM += plusDMs[i];
    firstMinusDM += minusDMs[i];
  }
  
  smoothedTR.push(firstTR);
  smoothedPlusDM.push(firstPlusDM);
  smoothedMinusDM.push(firstMinusDM);
  
  // Qalan dəyərlər
  for (let i = 1; i < trueRanges.length - period + 1; i++) {
    const tr = smoothedTR[i-1] - (smoothedTR[i-1] / period) + trueRanges[i+period-1];
    const plusDM = smoothedPlusDM[i-1] - (smoothedPlusDM[i-1] / period) + plusDMs[i+period-1];
    const minusDM = smoothedMinusDM[i-1] - (smoothedMinusDM[i-1] / period) + minusDMs[i+period-1];
    
    smoothedTR.push(tr);
    smoothedPlusDM.push(plusDM);
    smoothedMinusDM.push(minusDM);
  }
  
  // +DI və -DI
  const pdi = [];
  const mdi = [];
  
  for (let i = 0; i < smoothedTR.length; i++) {
    pdi.push((smoothedPlusDM[i] / smoothedTR[i]) * 100);
    mdi.push((smoothedMinusDM[i] / smoothedTR[i]) * 100);
  }
  
  // DX
  const dx = [];
  
  for (let i = 0; i < pdi.length; i++) {
    dx.push(Math.abs(pdi[i] - mdi[i]) / (pdi[i] + mdi[i]) * 100);
  }
  
  // ADX (DX-in 'period' periyod üçün ortalaması)
  const adx = [];
  
  let sum = 0;
  for (let i = 0; i < period && i < dx.length; i++) {
    sum += dx[i];
  }
  
  adx.push(sum / period);
  
  for (let i = period; i < dx.length; i++) {
    adx.push((adx[adx.length - 1] * (period - 1) + dx[i]) / period);
  }
  
  return {
    adx,
    pdi,
    mdi
  };
}

// Stochastic RSI hesablama
/*
function calculateStochRSI(data, period = STOCH_RSI_PERIOD, kPeriod = STOCH_RSI_K, dPeriod = STOCH_RSI_D) {
  // Əvvəlcə normal RSI hesablayırıq
  const rsi = calculateRSI(data, period);
  
  // Əgər kifayət qədər RSI dəyəri yoxdursa, boş nəticə qaytar
  if (rsi.length < period) {
    return {
      k: [],
      d: []
    };
  }
  
  // Stochastic RSI hesablama
  const stochRsi = [];
  
  for (let i = period - 1; i < rsi.length; i++) {
    const rsiSlice = rsi.slice(i - period + 1, i + 1);
    const minRsi = Math.min(...rsiSlice);
    const maxRsi = Math.max(...rsiSlice);
    
    // (Current RSI - MinRSI) / (MaxRSI - MinRSI)
    let value = 0;
    if (maxRsi !== minRsi) {
      value = (rsi[i] - minRsi) / (maxRsi - minRsi);
    }
    
    stochRsi.push(value * 100); // 0-100 arasına çevir
  }
  
  // %K (SMA-ya əsasən)
  const k = calculateSMA(stochRsi, kPeriod);
  
  // %D (K'nın SMA-sı)
  const d = calculateSMA(k, dPeriod);
  
  return {
    k,
    d
  };
}
*/

// MACD hesablama
function calculateMACD(data, fastPeriod = MACD_FAST, slowPeriod = MACD_SLOW, signalPeriod = MACD_SIGNAL) {
  // Fast və Slow EMA hesabla
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  // MACD Line = Fast EMA - Slow EMA
  const macdLine = [];
  
  // SlowEMA başladığı nöqtədən hesablamağa başla
  const startIndex = slowPeriod - fastPeriod;
  
  for (let i = 0; i < slowEMA.length; i++) {
    const fastIndex = i + startIndex;
    macdLine.push(fastEMA[fastIndex] - slowEMA[i]);
  }
  
  // Signal Line = MACD Line'nın EMA'sı
  const signalLine = calculateEMA(macdLine, signalPeriod);
  
  // Histogram = MACD Line - Signal Line
  const histogram = [];
  
  for (let i = 0; i < signalLine.length; i++) {
    histogram.push(macdLine[i + macdLine.length - signalLine.length] - signalLine[i]);
  }
  
  return {
    macdLine,
    signalLine,
    histogram
  };
}

// Siqnal statistikasını göstər
function showSignalStatistics() {
  try {
    const stats = analyzeSignalStatistics();
    
    // Əgər statistika yoxdursa, heç nə etmə
    if (stats.totalSignals === 0) {
      updateStatus('Statistika üçün əvvəlcə bir neçə tamamlanmış əməliyyat lazımdır.');
      return;
    }
    
    // Statistika paneli yarat
    const statsDiv = document.createElement('div');
    statsDiv.className = 'stats-summary';
    statsDiv.innerHTML = `
      <h3>Statistika Nəticələri (${stats.totalSignals} əməliyyat)</h3>
      <div class="stats-detail">
        <div class="stat-group">
          <div class="stat-item win-rate">
            <i class="fas fa-trophy"></i>
            <span>Ümumi Win Rate: ${stats.winRate.toFixed(1)}%</span>
          </div>
          <div class="stat-item">
            <i class="fas fa-long-arrow-alt-up"></i>
            <span>LONG Win Rate: ${stats.longWinRate.toFixed(1)}%</span>
          </div>
          <div class="stat-item">
            <i class="fas fa-long-arrow-alt-down"></i>
            <span>SHORT Win Rate: ${stats.shortWinRate.toFixed(1)}%</span>
          </div>
          <div class="stat-item">
            <i class="fas fa-chart-line"></i>
            <span>Ən uğurlu rejim: ${stats.bestMarketState}</span>
          </div>
        </div>
        
        <div class="top-indicators">
          <h4>Ən uğurlu indikatorlar:</h4>
          <ul>
            ${stats.topIndicators.map(ind => 
              `<li>${ind.reason}: ${ind.winRate.toFixed(1)}% (${ind.total} siqnal)</li>`
            ).join('')}
          </ul>
        </div>
      </div>
    `;
    
    // Mövcud panel varsa yenilə, yoxdursa əlavə et
    const existingPanel = document.querySelector('.stats-summary');
    if (existingPanel) {
      existingPanel.replaceWith(statsDiv);
    } else {
      const firstCard = document.querySelector('.card');
      if (firstCard) {
        firstCard.parentNode.insertBefore(statsDiv, firstCard);
      }
    }
    
    updateStatus(`Statistika göstərildi: ${stats.totalSignals} əməliyyat, Win rate: ${stats.winRate.toFixed(1)}%`);
  } catch (error) {
    console.error('Statistika göstərilməsi xətası:', error);
    updateStatus('Statistika göstərilməsi zamanı xəta baş verdi.');
  }
}

// Bollinger Bands hesaplama
function calculateBollingerBands(data, period = 20, multiplier = 2) {
  // Standart SMA hesapla
  const sma = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    sma.push(sum / period);
  }
  
  // Standart sapma hesapla
  const standardDeviation = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += Math.pow(data[i - j] - sma[i - (period - 1)], 2);
    }
    standardDeviation.push(Math.sqrt(sum / period));
  }
  
  // Üst ve alt bantları hesapla
  const upperBand = [];
  const lowerBand = [];
  
  for (let i = 0; i < sma.length; i++) {
    upperBand.push(sma[i] + (standardDeviation[i] * multiplier));
    lowerBand.push(sma[i] - (standardDeviation[i] * multiplier));
  }
  
  return {
    middle: sma,
    upper: upperBand,
    lower: lowerBand
  };
}

// Bollinger Bands sabitleri
const BOLLINGER_PERIOD = 20;
const BOLLINGER_MULTIPLIER = 2;
const BOLLINGER_SQUEEZE_THRESHOLD = 0.1; // Bantların sıkışma eşiği
const BOLLINGER_BREAKOUT_PERCENTAGE = 0.05; // Kırılma yüzdesi

// Bollinger Bands stratejisi
function applyBollingerBandsStrategy(prices, volumes) {
  // Kapanış fiyatlarını al
  const closePrices = prices.map(candle => candle.close);
  
  // Bollinger Bands hesapla
  const bollingerBands = calculateBollingerBands(closePrices, BOLLINGER_PERIOD, BOLLINGER_MULTIPLIER);
  
  // Son fiyat verileri
  const currentPrice = closePrices[closePrices.length - 1];
  const previousPrice = closePrices[closePrices.length - 2];
  
  // Son Bollinger değerleri
  const lastIndex = bollingerBands.middle.length - 1;
  const middle = bollingerBands.middle[lastIndex];
  const upper = bollingerBands.upper[lastIndex];
  const lower = bollingerBands.lower[lastIndex];
  
  // Bir önceki değerler
  const prevMiddle = bollingerBands.middle[lastIndex - 1];
  const prevUpper = bollingerBands.upper[lastIndex - 1];
  const prevLower = bollingerBands.lower[lastIndex - 1];
  
  // Bant genişliği
  const bandWidth = (upper - lower) / middle;
  const prevBandWidth = (prevUpper - prevLower) / prevMiddle;
  
  // Bollinger Sıkışması (Squeeze) kontrolü
  const isSqueeze = bandWidth < BOLLINGER_SQUEEZE_THRESHOLD;
  const wasSqueezeBeforeNow = prevBandWidth < BOLLINGER_SQUEEZE_THRESHOLD;
  const endOfSqueeze = isSqueeze === false && wasSqueezeBeforeNow === true;
  
  // Hacim artışı
  const lastVolume = volumes[volumes.length - 1];
  const prevVolumes = volumes.slice(volumes.length - 6, volumes.length - 1);
  const avgVolume = prevVolumes.reduce((sum, vol) => sum + vol, 0) / prevVolumes.length;
  const volumeIncrease = lastVolume > avgVolume * 1.5;
  
  // Kırılma kontrolü
  const upperBreakout = previousPrice <= prevUpper && currentPrice > upper && volumeIncrease;
  const lowerBreakout = previousPrice >= prevLower && currentPrice < lower && volumeIncrease;
  
  // Dönüş (reversal) sinyalleri
  const isOverbought = currentPrice > upper && (currentPrice - upper) / upper > BOLLINGER_BREAKOUT_PERCENTAGE;
  const isOversold = currentPrice < lower && (lower - currentPrice) / lower > BOLLINGER_BREAKOUT_PERCENTAGE;
  
  if (upperBreakout || endOfSqueeze && currentPrice > upper && volumeIncrease) {
    return "LONG";
  } else if (lowerBreakout || endOfSqueeze && currentPrice < lower && volumeIncrease) {
    return "SHORT";
  } else if (isOverbought && (previousPrice - currentPrice) / previousPrice > 0.002) {
    return "SHORT"; // Aşırı alım bölgesinde olası dönüş
  } else if (isOversold && (currentPrice - previousPrice) / previousPrice > 0.002) {
    return "LONG"; // Aşırı satım bölgesinde olası dönüş
  }
  
  return null; // Sinyal yok
}

// Strateji seçimleri
const strategies = {
  "EMA_VOLUME_ORDERBOOK": analyzeMarketWithScore
};

// Martingale ve Manuel Balans Yönetimi Parametreleri
const MANUAL_BALANCE = 300; // USDT cinsinden manuel bakiye

// Her seviye için TP ve SL ROI ve USDT değerleri (verdiğiniz örneklere göre)
const MARTINGALE_LEVELS = [
  { 
    margin: 12.47, 
    leverage: 20, 
    tpROI: 1.10,
    slROI: 0.55,
    slAmount: -1.85
  },
  { 
    margin: 17.51, 
    leverage: 25, 
    tpROI: 1.10,
    slROI: 0.55,
    slAmount: -3.20
  },
  { 
    margin: 29.89, 
    leverage: 25, 
    tpROI: 1.10,
    slROI: 0.55,
    slAmount: -5.55
  },
  { 
    margin: 52.64, 
    leverage: 25, 
    tpROI: 1.10,
    slROI: 0.55,
    slAmount: -9.75
  },
  { 
    margin: 75.62, 
    leverage: 30, 
    tpROI: 1.10,
    slROI: 0.55,
    slAmount: -16.90
  }
];

// Ücret yapısı (Trading fees)
const TRADING_FEES = {
  opening: 0.001, // %0.1 açılış ücreti
  closing: 0.0004 // %0.04 kapanış ücreti
};

// Global martingale değişkenleri
let currentBalance = MANUAL_BALANCE; // Mevcut balans
let currentMartingaleLevel = 0; // Şu anki martingale seviyesi (0-based)
let totalLosses = 0; // Toplam kayıplar
let lossHistory = []; // Kayıp geçmişi
let isRecoveryMode = false; // Recovery mod durumu

// Martingale ve Balans Yönetimi Fonksiyonları

// Mevcut seviye için işlem parametrelerini hesapla
function getCurrentTradeParams() {
  if (currentMartingaleLevel >= MARTINGALE_LEVELS.length) {
    // Maksimum seviyeye ulaşıldı, son seviyeyi kullan
    currentMartingaleLevel = MARTINGALE_LEVELS.length - 1;
  }
  
  const levelParams = MARTINGALE_LEVELS[currentMartingaleLevel];
  const margin = levelParams.margin;
  const leverage = levelParams.leverage;
  const positionSize = margin * leverage;
  
  // Ücretleri hesapla
  const openingFee = positionSize * TRADING_FEES.opening;
  const closingFee = positionSize * TRADING_FEES.closing;
  const totalFees = openingFee + closingFee;
  
  // TP ve SL değerlerini JSON'dan al (her seviye için farklı)
  const tpROI = levelParams.tpROI;       // %0.26, %0.25, %0.31, %0.34, %0.54
  const slROI = levelParams.slROI;       // %0.45, %0.43, %0.27, %0.30, %0.50
  const tpBrutAmount = levelParams.tpAmount; // Brüt TP kar (ücretler dahil)
  const slAmount = levelParams.slAmount;     // SL kayıp
  
  // Net TP kar = Brüt kar - ücretler (TP'den ücretleri çıkar)
  const profitTarget = tpBrutAmount - totalFees;
  
  return {
    level: currentMartingaleLevel + 1,
    margin: margin,
    leverage: leverage,
    positionSize: positionSize,
    openingFee: openingFee,
    closingFee: closingFee,
    totalFees: totalFees,
    profitTarget: profitTarget,
    slAmount: slAmount,
    tpROI: tpROI,
    slROI: slROI,
    isRecovery: currentMartingaleLevel > 0
  };
}

// TP fiyatını hesapla (ROI değerine göre)
function calculateTakeProfit(entryPrice, direction, tpROI) {
  const priceChangePercent = tpROI / 100; // ROI'yi yüzdeye çevir
  
  if (direction === 'LONG') {
    return entryPrice * (1 + priceChangePercent);
  } else {
    return entryPrice * (1 - priceChangePercent);
  }
}

// SL fiyatını hesapla (ROI değerine göre)
function calculateStopLoss(entryPrice, direction, slROI) {
  const priceChangePercent = slROI / 100; // ROI'yi yüzdeye çevir
  
  if (direction === 'LONG') {
    return entryPrice * (1 - priceChangePercent);
  } else {
    return entryPrice * (1 + priceChangePercent);
  }
}

// İşlem sonucunu kaydet ve balansı güncelle  
function processTradeResult(result, tradeParams, actualPnL) {
  const timestamp = new Date().toLocaleString('tr-TR');
  
  console.log(`🔍 processTradeResult çağrıldı! Result: ${result}, Önceki Bakiye: ${currentBalance.toFixed(2)} USDT`);
  
  if (result === 'TP') {
    // TP - Sadece 0.04 USDT kar ekle
    currentBalance += 0.04;
    
    // Martingale seviyesini sıfırla
    currentMartingaleLevel = 0;
    totalLosses = 0;
    lossHistory = [];
    isRecoveryMode = false;
    
    console.log(`✅ TP! Kar: 0.04 USDT, Yeni Bakiye: ${currentBalance.toFixed(2)} USDT`);
    
  } else if (result === 'SL') {
    // SL - Balansı değiştirme, sadece seviye artır
    
    // Kayıp geçmişine ekle (gösterim için)
    lossHistory.push({
      level: currentMartingaleLevel + 1,
      loss: 0, // Balans değişmedi
      timestamp: timestamp
    });
    
    // Martingale seviyesini artır
    currentMartingaleLevel++;
    isRecoveryMode = true;
    
    console.log(`❌ SL! Balans değişmedi, Level ${currentMartingaleLevel + 1} geçiş`);
  }
  
  // Balans güncellemesini UI'da göster
  updateBalanceDisplay();
  console.log(`🔍 updateBalanceDisplay çağrıldı! Final Bakiye: ${currentBalance.toFixed(2)} USDT`);
}

// Balans bilgilerini UI'da göster - TEMİZLENDİ
function updateBalanceDisplay() {
  console.log(`🔍 updateBalanceDisplay: Bakiye ${currentBalance.toFixed(2)} USDT, Level ${currentMartingaleLevel + 1}`);
  
  // Sadece gerekli olan status container'ı güncelle
  const statusContainer = document.getElementById('statusContainer');
  if (statusContainer) {
    const balanceInfo = `💰 Bakiye: ${currentBalance.toFixed(2)} USDT | 📊 Level: ${currentMartingaleLevel + 1}`;
    statusContainer.innerHTML = balanceInfo;
    console.log(`🔍 statusContainer güncellendi: ${balanceInfo}`);
  } else {
    console.log(`❌ statusContainer bulunamadı!`);
  }
}

// İşlem parametrelerini güncelle - KALDIRILDI

// İşlem önerisi oluştur
function generateTradeRecommendation(symbol, signal, entryPrice) {
  const tradeParams = getCurrentTradeParams();
  
  const takeProfit = calculateTakeProfit(entryPrice, signal, tradeParams.tpROI);
  const stopLoss = calculateStopLoss(entryPrice, signal, tradeParams.slROI);
  
  return {
    symbol: symbol,
    direction: signal,
    entryPrice: entryPrice,
    margin: tradeParams.margin,
    leverage: tradeParams.leverage,
    positionSize: tradeParams.positionSize,
    takeProfit: takeProfit,
    stopLoss: stopLoss,
    profitTarget: tradeParams.profitTarget,
    slAmount: tradeParams.slAmount,
    fees: tradeParams.totalFees,
    tpROI: tradeParams.tpROI,
    slROI: tradeParams.slROI,
    level: tradeParams.level,
    isRecovery: tradeParams.isRecovery,
    recoveryInfo: isRecoveryMode ? {
      totalLosses: totalLosses,
      lossHistory: lossHistory,
      currentLevel: currentMartingaleLevel + 1
    } : null
  };
}

// Reset fonksiyonları - KALDIRILDI

// Analiz bilgi panelini güncelle
function updateAnalysisInfoPanel() {
  const activePositionInfo = document.getElementById('activePositionInfo');
  
  if (activePositionInfo) {
    // Aktif işlem sayısını say
    let activeCount = 0;
    let latestPosition = null;
    
    // Tüm aktif işlemleri kontrol et
    Object.keys(activeWatchers).forEach(watcherId => {
      if (activeWatchers[watcherId]) {
        activeCount++;
        // Son aktif pozisyonu bul
        for (const limit in LIMITS) {
          const tableBodyId = LIMITS[limit].tableBodyId;
          const rows = document.getElementById(tableBodyId).querySelectorAll('tr[data-active="true"]');
          if (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            latestPosition = {
              symbol: lastRow.getAttribute('data-symbol'),
              signal: lastRow.getAttribute('data-signal'),
              level: lastRow.querySelector('.recovery-badge') ? 
                     lastRow.querySelector('.recovery-badge').textContent : 'L1'
            };
          }
        }
      }
    });
    
    // Panel bilgisini güncelle
    if (activeCount > 0 && latestPosition) {
      activePositionInfo.innerHTML = `
        <strong>${latestPosition.symbol}</strong> - 
        <span class="${latestPosition.signal}">${latestPosition.signal}</span>
        <span class="level-badge">${latestPosition.level}</span>
      `;
      activePositionInfo.className = 'info-value active';
    } else {
      activePositionInfo.textContent = 'Hazırda yoxdur';
      activePositionInfo.className = 'info-value';
    }
  }
}