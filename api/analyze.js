// Vercel Serverless Function - Kripto Analiz API
import fetch from 'node-fetch';

// Sabitler
const CANDLE_COUNT = 72;
const CANDLE_INTERVAL = '3m';
const CONFIDENCE_THRESHOLD = 40;
const MIN_SIGNAL_COUNT = 2;

// Bitget API fonksiyonu
async function getBitgetData(symbol, interval, limit) {
  try {
    const url = `https://api.bitget.com/api/v2/mix/market/candles?symbol=${symbol}&granularity=${interval}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.code !== '00000') {
      throw new Error(`Bitget API error: ${data.msg}`);
    }
    
    return data.data.map(candle => ({
      time: parseInt(candle[0]),
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  } catch (error) {
    console.error('Bitget API Error:', error);
    throw error;
  }
}

// Teknik analiz fonksiyonları
function simpleMovingAverage(data, period) {
  const result = [];
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, val) => acc + val.close, 0);
    result.push(sum / period);
  }
  return result;
}

function exponentialMovingAverage(data, period) {
  const result = [];
  const multiplier = 2 / (period + 1);
  
  if (data.length === 0) return result;
  
  result[0] = data[0].close;
  
  for (let i = 1; i < data.length; i++) {
    result[i] = (data[i].close * multiplier) + (result[i - 1] * (1 - multiplier));
  }
  
  return result;
}

function calculateRSI(data, period = 14) {
  if (data.length < period + 1) return [];
  
  const gains = [];
  const losses = [];
  
  for (let i = 1; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  const result = [];
  
  for (let i = period - 1; i < gains.length; i++) {
    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
    
    if (avgLoss === 0) {
      result.push(100);
    } else {
      const rs = avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }
  }
  
  return result;
}

function calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = exponentialMovingAverage(data, fastPeriod);
  const slowEMA = exponentialMovingAverage(data, slowPeriod);
  
  const macdLine = [];
  const startIndex = slowPeriod - 1;
  
  for (let i = startIndex; i < fastEMA.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i - startIndex]);
  }
  
  const signalLine = [];
  if (macdLine.length > 0) {
    const multiplier = 2 / (signalPeriod + 1);
    signalLine[0] = macdLine[0];
    
    for (let i = 1; i < macdLine.length; i++) {
      signalLine[i] = (macdLine[i] * multiplier) + (signalLine[i - 1] * (1 - multiplier));
    }
  }
  
  const histogram = macdLine.map((macd, i) => macd - (signalLine[i] || 0));
  
  return { macdLine, signalLine, histogram };
}

// Ana karar verme fonksiyonu
function makeDecision(data) {
  if (!data || data.length < 50) {
    return {
      decision: 'Hold',
      confidence: 0,
      signals: { long: 0, short: 0 },
      details: 'Yetersiz veri'
    };
  }

  let longSignals = 0;
  let shortSignals = 0;
  const signals = [];

  // Fiyat verileri
  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);
  const volumes = data.map(d => d.volume);
  
  const currentPrice = closes[closes.length - 1];
  const previousPrice = closes[closes.length - 2];

  // 1. SMA Analizi
  const sma20 = simpleMovingAverage(data, 20);
  const sma50 = simpleMovingAverage(data, 50);
  
  if (sma20.length > 0 && sma50.length > 0) {
    const currentSMA20 = sma20[sma20.length - 1];
    const currentSMA50 = sma50[sma50.length - 1];
    
    if (currentPrice > currentSMA20 && currentSMA20 > currentSMA50) {
      longSignals++;
      signals.push('SMA Yükseliş Trendi');
    } else if (currentPrice < currentSMA20 && currentSMA20 < currentSMA50) {
      shortSignals++;
      signals.push('SMA Düşüş Trendi');
    }
  }

  // 2. EMA Analizi
  const ema12 = exponentialMovingAverage(data, 12);
  const ema26 = exponentialMovingAverage(data, 26);
  
  if (ema12.length > 0 && ema26.length > 0) {
    const currentEMA12 = ema12[ema12.length - 1];
    const currentEMA26 = ema26[ema26.length - 1];
    
    if (currentEMA12 > currentEMA26) {
      longSignals++;
      signals.push('EMA Yükseliş');
    } else {
      shortSignals++;
      signals.push('EMA Düşüş');
    }
  }

  // 3. RSI Analizi
  const rsi = calculateRSI(data, 14);
  if (rsi.length > 0) {
    const currentRSI = rsi[rsi.length - 1];
    
    if (currentRSI < 35) {
      longSignals++;
      signals.push(`RSI Aşırı Satım (${currentRSI.toFixed(2)})`);
    } else if (currentRSI > 65) {
      shortSignals++;
      signals.push(`RSI Aşırı Alım (${currentRSI.toFixed(2)})`);
    }
  }

  // 4. MACD Analizi
  const macd = calculateMACD(data);
  if (macd.macdLine.length > 1 && macd.signalLine.length > 1) {
    const currentMACD = macd.macdLine[macd.macdLine.length - 1];
    const currentSignal = macd.signalLine[macd.signalLine.length - 1];
    const prevMACD = macd.macdLine[macd.macdLine.length - 2];
    const prevSignal = macd.signalLine[macd.signalLine.length - 2];
    
    // MACD çizgisi sinyal çizgisini yukarı keserse
    if (currentMACD > currentSignal && prevMACD <= prevSignal) {
      longSignals++;
      signals.push('MACD Yükseliş Kesişimi');
    }
    // MACD çizgisi sinyal çizgisini aşağı keserse
    else if (currentMACD < currentSignal && prevMACD >= prevSignal) {
      shortSignals++;
      signals.push('MACD Düşüş Kesişimi');
    }
  }

  // 5. Fiyat Momentum
  const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;
  if (Math.abs(priceChange) > 0.1) {
    if (priceChange > 0) {
      longSignals++;
      signals.push(`Pozitif Momentum (+${priceChange.toFixed(2)}%)`);
    } else {
      shortSignals++;
      signals.push(`Negatif Momentum (${priceChange.toFixed(2)}%)`);
    }
  }

  // 6. Volume Analizi
  if (volumes.length >= 10) {
    const avgVolume = volumes.slice(-10).reduce((a, b) => a + b) / 10;
    const currentVolume = volumes[volumes.length - 1];
    
    if (currentVolume > avgVolume * 1.5) {
      if (priceChange > 0) {
        longSignals++;
        signals.push('Yüksek Volume + Fiyat Artışı');
      } else if (priceChange < 0) {
        shortSignals++;
        signals.push('Yüksek Volume + Fiyat Düşüşü');
      }
    }
  }

  // Karar verme
  const totalSignals = longSignals + shortSignals;
  let decision = 'Hold';
  let confidence = 0;

  if (totalSignals >= MIN_SIGNAL_COUNT) {
    if (longSignals > shortSignals) {
      decision = 'Long';
      confidence = Math.min(90, (longSignals / totalSignals) * 100);
    } else if (shortSignals > longSignals) {
      decision = 'Short';
      confidence = Math.min(90, (shortSignals / totalSignals) * 100);
    }
  }

  // Minimum confidence kontrolü
  if (confidence < CONFIDENCE_THRESHOLD) {
    decision = 'Hold';
    confidence = 0;
  }

  return {
    decision,
    confidence: Math.round(confidence),
    signals: { long: longSignals, short: shortSignals },
    details: signals.join(', ') || 'Sinyal bulunamadı',
    price: currentPrice,
    timestamp: Date.now()
  };
}

// Ana API handler
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { symbol = 'BTCUSDT' } = req.query;
    
    // Bitget'ten veri al
    const candles = await getBitgetData(symbol, CANDLE_INTERVAL, CANDLE_COUNT);
    
    if (!candles || candles.length === 0) {
      return res.status(400).json({
        error: 'Veri alınamadı',
        symbol,
        timestamp: Date.now()
      });
    }

    // Analiz yap
    const analysis = makeDecision(candles);
    
    // Sonucu döndür
    return res.status(200).json({
      success: true,
      symbol,
      analysis,
      candleCount: candles.length,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Analiz hatası',
      message: error.message,
      timestamp: Date.now()
    });
  }
} 