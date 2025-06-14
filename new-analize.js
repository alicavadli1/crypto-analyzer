const STOP_LOSS_PERCENT = 0.015;

// Binance API'sinden kripto para simgelerini al
function getBinanceSymbols(callback) {
  const xhr = new XMLHttpRequest();
  const url = "https://api.binance.com/api/v3/exchangeInfo";

  xhr.open("GET", url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      const response = JSON.parse(xhr.responseText);
      const symbols = response.symbols;
      if (callback) {
        callback(symbols);
      }
    }
  };
  xhr.send();
}

// Binance simgelerini <select> öğesine ekle
function populateSelect(symbols) {
  const select = document.getElementById("coinSelect");
  select.innerHTML = '<option value="">Seçiniz</option>'; // Başlangıçta seçeneği temizle

  symbols.forEach((symbol) => {
    if (symbol.quoteAsset === "USDT" && symbol.symbol.endsWith("USDT")) {
      // USDT ile işlem gören kripto paraları listele
      const option = document.createElement("option");
      option.value = symbol.symbol;
      option.textContent = symbol.symbol;
      select.appendChild(option);
    }
  });

  // Seçeneklerin eklendiğini kontrol et
  if (select.options.length === 1) {
    console.log("Hiç kripto para seçeneği bulunamadı.");
  }
}

// Binance API'sinden veriyi al
function getBinanceData(symbol, interval, limit, callback) {
  const xhr = new XMLHttpRequest();
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

  xhr.open("GET", url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      console.log("Fetched Data:", data); // Veri kontrolü
      callback(data);
    }
  };
  xhr.send();
}

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
function calculateMACD(
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
function calculateBollingerBands(data, period = 20, numOfStdDev = 2) {
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
function calculateRSI(data, period) {
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

function calculateATR(data, period = 14) {
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

function calculateParabolicSAR(data, step = 0.02, max = 0.2) {
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

// Karar verme
function makeDecision(data) {
  const latestCandle = data[data.length - 1];
  const latestPrice = parseFloat(latestCandle[4]);

  // Gerekli hesaplamalar
  const highestHigh = Math.max(...data.map((candle) => parseFloat(candle[2])));
  const lowestLow = Math.min(...data.map((candle) => parseFloat(candle[3])));
  const lastHigh = parseFloat(latestCandle[2]);
  const lastLow = parseFloat(latestCandle[3]);
  const lastClose = parseFloat(latestCandle[4]);

  const fibLevels = calculateFibonacciLevels(highestHigh, lowestLow);
  const ichimoku = calculateIchimokuCloud(data);
  const stochRSI = calculateStochasticRSI(data);
  const pivotPoints = calculatePivotPoints(lastHigh, lastLow, lastClose);
  const vwap = calculateVWAP(data);
  const rsi = calculateRSI(data, 14);
  const macd = calculateMACD(data);
  const bollingerBands = calculateBollingerBands(data);
  const atr = calculateATR(data, 14);
  const sar = calculateParabolicSAR(data);

  let decisionPoints = 0;

  // Fibonacci seviyelerine göre karar verme
  if (latestPrice > fibLevels.level61_8 && latestPrice < fibLevels.level50) {
    decisionPoints += 1; // Potansiyel yükseliş sinyali
  } else if (latestPrice < fibLevels.level38_2 && latestPrice > fibLevels.level23_6) {
    decisionPoints -= 1; // Potansiyel düşüş sinyali
  }

  // Ichimoku bulutuna göre karar verme
  const lastConversionLine = ichimoku.conversionLine[ichimoku.conversionLine.length - 1];
  const lastBaseLine = ichimoku.baseLine[ichimoku.baseLine.length - 1];
  const lastLeadingSpanA = ichimoku.leadingSpanA[ichimoku.leadingSpanA.length - 1];
  const lastLeadingSpanB = ichimoku.leadingSpanB[ichimoku.leadingSpanB.length - 1];

  if (latestPrice > lastConversionLine && latestPrice > lastBaseLine &&
      latestPrice > Math.max(lastLeadingSpanA, lastLeadingSpanB)) {
    decisionPoints += 2; // Güçlü yükseliş sinyali
  } else if (latestPrice < lastConversionLine && latestPrice < lastBaseLine &&
             latestPrice < Math.min(lastLeadingSpanA, lastLeadingSpanB)) {
    decisionPoints -= 2; // Güçlü düşüş sinyali
  }

  // Stokastik RSI'ya göre karar verme
  const lastK = stochRSI.k[stochRSI.k.length - 1];
  const lastD = stochRSI.d[stochRSI.d.length - 1];

  if (lastK < 20 && lastD < 20 && lastK > lastD) {
    decisionPoints += 1.5; // Aşırı satım bölgesinden çıkış sinyali (potansiyel yükseliş)
  } else if (lastK > 80 && lastD > 80 && lastK < lastD) {
    decisionPoints -= 1.5; // Aşırı alım bölgesinden çıkış sinyali (potansiyel düşüş)
  }

  // Pivot noktalarına göre karar verme
  if (latestPrice > pivotPoints.pivot && latestPrice < pivotPoints.r1) {
    decisionPoints += 0.5; // Yükseliş potansiyeli
  } else if (latestPrice < pivotPoints.pivot && latestPrice > pivotPoints.s1) {
    decisionPoints -= 0.5; // Düşüş potansiyeli
  }

  // VWAP'a göre karar verme
  const lastVWAP = vwap[vwap.length - 1];
  if (latestPrice > lastVWAP) {
    decisionPoints += 1; // Fiyat VWAP'ın üzerinde, potansiyel yükseliş
  } else {
    decisionPoints -= 1; // Fiyat VWAP'ın altında, potansiyel düşüş
  }

  // RSI'ya göre karar verme
  const lastRSI = rsi[rsi.length - 1];
  if (lastRSI < 30) {
    decisionPoints += 1.5; // Aşırı satım bölgesi, potansiyel yükseliş
  } else if (lastRSI > 70) {
    decisionPoints -= 1.5; // Aşırı alım bölgesi, potansiyel düşüş
  }

  // MACD'ye göre karar verme
  const lastMACDLine = macd.macdLine[macd.macdLine.length - 1];
  const lastSignalLine = macd.signalLine[macd.signalLine.length - 1];
  if (lastMACDLine > lastSignalLine && lastMACDLine > 0) {
    decisionPoints += 1.5; // MACD pozitif ve sinyal çizgisinin üzerinde, yükseliş sinyali
  } else if (lastMACDLine < lastSignalLine && lastMACDLine < 0) {
    decisionPoints -= 1.5; // MACD negatif ve sinyal çizgisinin altında, düşüş sinyali
  }

  // Bollinger Bandlarına göre karar verme
  const lastBB = bollingerBands[bollingerBands.length - 1];
  if (latestPrice < lastBB.lower) {
    decisionPoints += 1; // Fiyat alt bandın altında, potansiyel yükseliş
  } else if (latestPrice > lastBB.upper) {
    decisionPoints -= 1; // Fiyat üst bandın üstünde, potansiyel düşüş
  }

  // Parabolic SAR'a göre karar verme
  const lastSAR = sar[sar.length - 1];
  if (latestPrice > lastSAR) {
    decisionPoints += 1; // Fiyat SAR'ın üzerinde, potansiyel yükseliş sinyali
  } else if (latestPrice < lastSAR) {
    decisionPoints -= 1; // Fiyat SAR'ın altında, potansiyel düşüş sinyali
  }

  // Toplam karar puanına göre son kararı ver
  let decision;
  let takeProfitPercent;
  let stopLossPercent;

  if (decisionPoints > 2) {
    decision = "Long";
    takeProfitPercent = 0.01 + (decisionPoints - 2) * 0.002;
    stopLossPercent = 0.005 + (decisionPoints - 2) * 0.001;
  } else if (decisionPoints < -2) {
    decision = "Short";
    takeProfitPercent = 0.01 + (Math.abs(decisionPoints) - 2) * 0.002;
    stopLossPercent = 0.005 + (Math.abs(decisionPoints) - 2) * 0.001;
  } else {
    decision = "Hold";
    takeProfitPercent = 0;
    stopLossPercent = 0;
  }

  // Take profit ve stop loss yüzdelerini sınırla
  takeProfitPercent = Math.min(takeProfitPercent, 0.03); // Maksimum %3
  stopLossPercent = Math.min(stopLossPercent, 0.02); // Maksimum %2

  // Dinamik stop loss ve hedef seviyeleri hesaplama
  const dynamicLevels = calculateDynamicLevels(latestPrice, decision, atr);
  const dynamicStopLoss = calculateDynamicStopLoss(latestPrice, decision, atr);

  // Risk/Ödül oranını hesapla
  const riskRewardRatio = takeProfitPercent / stopLossPercent;

  // Take profit yüzdesini sınırla
  takeProfitPercent = Math.min(takeProfitPercent, 0.05); // Maksimum %5

  return {
    decision,
    decisionPoints,
    takeProfitPercent,
    stopLossPercent,
    dynamicStopLoss,
    dynamicLevels,
    riskRewardRatio,
    latestPrice,
    indicators: {
      fibLevels,
      ichimoku: {
        conversionLine: lastConversionLine,
        baseLine: lastBaseLine,
        leadingSpanA: lastLeadingSpanA,
        leadingSpanB: lastLeadingSpanB,
      },
      stochRSI: { k: lastK, d: lastD },
      pivotPoints,
      vwap: lastVWAP,
      rsi: lastRSI,
      macd: { macdLine: lastMACDLine, signalLine: lastSignalLine },
      bollingerBands: lastBB,
      atr,
      parabolicSAR: lastSAR,
    },
  };
}

function calculateDynamicStopLoss(latestPrice, decision, atr, multiplier = 2) {
  if (decision === "Long") {
    return latestPrice - atr * multiplier;
  } else if (decision === "Short") {
    return latestPrice + atr * multiplier;
  }
  // Eğer karar "Hold" ise veya başka bir durumda, null döndür
  return null;
}

// Hedef ve Stop-Loss hesaplama
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

// Tarih ve saati formatla
function formatDate(timestamp) {
  const date = new Date(timestamp);
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  return date.toLocaleString("tr-TR", options).replace(",", "");
}

// Veriyi çek ve analiz et
function fetchData() {
  const coinSelect = document.getElementById("coinSelect");
  const selectedCoin = coinSelect.value;
  const investmentAmount = parseFloat(
    document.getElementById("investmentAmount").value
  );
  const leverage = parseInt(document.getElementById("leverage").value);

  if (!selectedCoin) {
    alert("Lütfen bir kripto para seçin.");
    return;
  }

  if (isNaN(investmentAmount) || investmentAmount <= 0) {
    alert("Lütfen geçerli bir yatırım miktarı girin.");
    return;
  }

  if (isNaN(leverage) || leverage < 1) {
    alert("Lütfen geçerli bir kaldıraç oranı girin.");
    return;
  }

  getBinanceData(selectedCoin, "3m", 72, function (data) {
    const { decision, rsi, takeProfitPercent, dynamicStopLoss } =
      makeDecision(data);
    const latestPrice = parseFloat(data[data.length - 1][4]);

    const {
      targetPrice1,
      targetPrice2,
      targetPrice3,
      stopLossPrice,
      stopLossPercent,
    } = calculateTargetsAndStopLoss(
      latestPrice,
      decision,
      takeProfitPercent,
      dynamicStopLoss
    );

    // Kâr/zarar hesaplamaları
    const calculateProfit = (targetPrice) => {
      const profit =
        investmentAmount *
        leverage *
        (Math.abs(targetPrice - latestPrice) / latestPrice);
      return profit.toFixed(2);
    };

    const stopLossAmount = (
      investmentAmount *
      leverage *
      (parseFloat(stopLossPercent) / 100)
    ).toFixed(2);

    // Karar ve hedefleri göster
    const decisionDiv = document.getElementById("decision");
    const targetsDiv = document.getElementById("targetsParrent");

    decisionDiv.innerHTML = `<strong class="decision-${decision.toLowerCase()}">Karar: ${decision}</strong>`;
    targetsDiv.innerHTML = `
      <div id="targets"> 
        <p id="entryPrice">Giriş Fiyatı: ${latestPrice}</p>
        <p id="takeProfit">Take Profit: ${(takeProfitPercent * 100).toFixed(
          2
        )}%</p>
        <p id="target1">Hedef 1: ${targetPrice1} (Kâr: ${calculateProfit(
      targetPrice1
    )} USDT)</p>
        <p id="target2">Hedef 2: ${targetPrice2} (Kâr: ${calculateProfit(
      targetPrice2
    )} USDT)</p>
        <p id="target3">Hedef 3: ${targetPrice3} (Kâr: ${calculateProfit(
      targetPrice3
    )} USDT)</p>
        <p id="stopLoss">Stop-Loss: ${stopLossPrice} (Zarar: ${stopLossAmount} USDT)</p>
      </div>
    `;

    // Tahminleri sakla
    savePrediction(
      selectedCoin,
      decision,
      latestPrice,
      { targetPrice1, targetPrice2, targetPrice3 },
      stopLossPrice,
      takeProfitPercent,
      investmentAmount,
      leverage
    );
  });
}
// Tahminleri sakla
function savePrediction(
  symbol,
  decision,
  latestPrice,
  targets,
  stopLoss,
  takeProfitPercent,
  investmentAmount,
  leverage
) {
  if (decision !== "Hold") {
    const predictions = JSON.parse(localStorage.getItem("predictions")) || [];
    const timestamp = new Date().toISOString();

    // Yüzdeleri hesapla
    const targetPercent1 = (
      ((targets.targetPrice1 - latestPrice) / latestPrice) *
      100
    ).toFixed(2);
    const targetPercent2 = (
      ((targets.targetPrice2 - latestPrice) / latestPrice) *
      100
    ).toFixed(2);
    const targetPercent3 = (
      ((targets.targetPrice3 - latestPrice) / latestPrice) *
      100
    ).toFixed(2);
    const stopLossPercent =
      decision === "Long"
        ? (((latestPrice - stopLoss) / latestPrice) * 100).toFixed(2)
        : (((stopLoss - latestPrice) / latestPrice) * 100).toFixed(2);

    const prediction = {
      symbol,
      decision,
      latestPrice,
      targets,
      targetPercents: {
        targetPercent1,
        targetPercent2,
        targetPercent3,
      },
      stopLoss,
      stopLossPercent,
      takeProfitPercent: (takeProfitPercent * 100).toFixed(2),
      investmentAmount,
      leverage,
      timestamp,
    };
    predictions.push(prediction);
    localStorage.setItem("predictions", JSON.stringify(predictions));
  }
}
function showLoader(show) {
  const loader = document.getElementById("loader");
  if (loader) {
    if (show) {
      loader.classList.remove("hidden");
    } else {
      loader.classList.add("hidden");
    }
  } else {
    console.error("Loader element bulunamadı");
  }
}

async function toggleResults() {
  const resultsDiv = document.getElementById("results");
  const dataDiv = document.getElementById("data");
  const toggleButton = document.querySelector(
    'button[onclick="toggleResults()"]'
  );

  if (resultsDiv.classList.contains("hidden")) {
    // Sonuçları gösterme
    dataDiv.style.display = "none";
    resultsDiv.classList.remove("hidden");

    // Loader'ı göster ve butonu devre dışı bırak
    showLoader(true);
    toggleButton.disabled = true;

    displayResults()
      .then(() => {
        // Loader'ı gizle ve butonu tekrar etkinleştir
        showLoader(false);
        toggleButton.disabled = false;
      })
      .catch((error) => {
        console.error("Sonuçlar gösterilirken bir hata oluştu:", error);
        showLoader(false);
        toggleButton.disabled = false;
      });

    toggleButton.textContent = "Sonuçları Gizle";
  } else {
    // Sonuçları gizleme
    dataDiv.style.display = "";
    resultsDiv.classList.add("hidden");
    toggleButton.textContent = "Sonuçları Göster";
  }
}

document.addEventListener("DOMContentLoaded", function () {
  flatpickr("#startDate", {
    dateFormat: "Y-m-d",
    maxDate: "today",
  });

  flatpickr("#endDate", {
    dateFormat: "Y-m-d",
    maxDate: "today",
  });
});

// Sonuçları göster
async function displayResults() {
  try {
    const resultsDiv = document.getElementById("results");
    const predictions = JSON.parse(localStorage.getItem("predictions")) || [];
    predictions.reverse();

    let resultsHtml = "<h2>Tahmin Sonuçları</h2>";

    let successfulPredictions = 0;
    let failedPredictions = 0;
    let ongoingPredictions = 0;

    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;

    const startTimestamp = startDate ? new Date(startDate).getTime() : 0;
    const endTimestamp = endDate
      ? new Date(endDate).setHours(23, 59, 59, 999)
      : Infinity;

    for (const prediction of predictions) {
      if (prediction.decision !== "Hold") {
        const predictionTimestamp = new Date(prediction.timestamp).getTime();

        if (
          predictionTimestamp >= startTimestamp &&
          predictionTimestamp <= endTimestamp
        ) {
          const decisionClass = `decision-${prediction.decision.toLowerCase()}-result`;
          const {
            result,
            hitPrice,
            hitDate,
            highestPrice,
            lowestPrice,
            highestDate,
            lowestDate,
          } = await checkPredictionResult(prediction);

          if (result === "Devam ediyor") {
            ongoingPredictions++;
          } else if (result.startsWith("Hedef")) {
            successfulPredictions++;
          } else if (result === "Stop-Loss") {
            failedPredictions++;
          }

          const calculateProfit = (targetPrice) => {
            const profit =
              prediction.investmentAmount *
              prediction.leverage *
              (Math.abs(targetPrice - prediction.latestPrice) /
                prediction.latestPrice);
            return profit.toFixed(2);
          };

          const stopLossAmount = (
            prediction.investmentAmount *
            prediction.leverage *
            (parseFloat(prediction.stopLossPercent) / 100)
          ).toFixed(2);

          resultsHtml += `
          <hr>
          <div class="${decisionClass}" style="display: flex; justify-content: space-between">
            <div>
              <h3>${prediction.symbol} - ${formatDate(
            prediction.timestamp
          )}</h3>
              <p>Karar: ${prediction.decision} (${
            prediction.takeProfitPercent
          }%)</p>
              <p>Giriş Fiyatı: ${prediction.latestPrice}</p>
              <p>Yatırım: ${prediction.investmentAmount} USDT (${
            prediction.leverage
          }x kaldıraç)</p>
              <p>Hedef 1: ${
                prediction.targets.targetPrice1
              } (Kâr: ${calculateProfit(
            prediction.targets.targetPrice1
          )} USDT)</p>
              <p>Hedef 2: ${
                prediction.targets.targetPrice2
              } (Kâr: ${calculateProfit(
            prediction.targets.targetPrice2
          )} USDT)</p>
              <p>Hedef 3: ${
                prediction.targets.targetPrice3
              } (Kâr: ${calculateProfit(
            prediction.targets.targetPrice3
          )} USDT)</p>
              <p>Stop-Loss: ${
                prediction.stopLoss
              } (Zarar: ${stopLossAmount} USDT)</p>
              <p>Sonuç: ${result}</p>
              ${hitPrice ? `<p>Gerçekleşme Fiyatı: ${hitPrice}</p>` : ""}
              ${
                hitDate
                  ? `<p>Gerçekleşme Tarihi: ${formatDate(hitDate)}</p>`
                  : ""
              }
              <p>En Yüksek Fiyat: ${highestPrice.toFixed(4)} (${formatDate(
            highestDate
          )})</p>
              <p>En Düşük Fiyat: ${lowestPrice.toFixed(4)} (${formatDate(
            lowestDate
          )})</p>
            </div>
            <div>
              <button onclick="confirmDelete('${prediction.symbol}', '${
            prediction.timestamp
          }')" class="del-btn">Sil</button>
            </div>
          </div>
        `;
        }
      }
    }

    // İstatistikleri ekleme
    const statisticsHtml = `
    <div class="prediction-statistics">
      <h3>Tahmin İstatistikleri</h3>
      <p class="success">Başarılı Tahminler: ${successfulPredictions}</p>
      <p class="fail">Başarısız Tahminler: ${failedPredictions}</p>
      <p class="wait">Devam Eden Tahminler: ${ongoingPredictions}</p>
    </div>
  `;

    resultsDiv.innerHTML = statisticsHtml + resultsHtml;
  } catch (error) {
    console.error("Sonuçlar gösterilirken bir hata oluştu:", error);
  } finally {
    showLoader(false);
  }
}

function confirmDelete(symbol, timestamp) {
  if (
    confirm(
      `${symbol} için ${formatDate(
        timestamp
      )} tarihli tahmini silmek istediğinizden emin misiniz?`
    )
  ) {
    showLoader(true);
    setTimeout(() => {
      // Simüle edilmiş bir gecikme
      deletePrediction(symbol, timestamp);
    }, 500);
  }
}

async function deletePrediction(symbol, timestamp) {
  try {
    let predictions = JSON.parse(localStorage.getItem("predictions")) || [];
    predictions = predictions.filter(
      (p) => !(p.symbol === symbol && p.timestamp === timestamp)
    );
    localStorage.setItem("predictions", JSON.stringify(predictions));
    await displayResults(); // Sonuçları yeniden göster
  } catch (error) {
    console.error("Silme işlemi sırasında bir hata oluştu:", error);
  } finally {
    showLoader(false);
  }
}

function checkPredictionResult(prediction) {
  return new Promise((resolve) => {
    const predictionDate = new Date(prediction.timestamp);
    const endDate = new Date();

    const startTime = predictionDate.getTime();
    const endTime = endDate.getTime();

    getBinanceHistoricalData(
      prediction.symbol,
      "15m",
      startTime,
      endTime,
      function (data) {
        let result = "Devam ediyor";
        let hitPrice = null;
        let hitDate = null;
        let highestPrice = parseFloat(prediction.latestPrice);
        let lowestPrice = parseFloat(prediction.latestPrice);
        let highestDate = predictionDate;
        let lowestDate = predictionDate;

        const intervalInMilliseconds = 15 * 60 * 1000; // 15 dakikalık mum için

        for (let i = 0; i < data.length; i++) {
          const candle = data[i];
          const candleOpenTime = new Date(candle[0]);
          const candleCloseTime = new Date(candle[0] + intervalInMilliseconds);
          const open = parseFloat(candle[1]);
          const high = parseFloat(candle[2]);
          const low = parseFloat(candle[3]);
          const close = parseFloat(candle[4]);

          // En yüksek ve en düşük fiyatları güncelle
          if (high > highestPrice) {
            highestPrice = high;
            highestDate = candleOpenTime;
          }
          if (low < lowestPrice) {
            lowestPrice = low;
            lowestDate = candleOpenTime;
          }

          if (prediction.decision === "Long") {
            if (low <= parseFloat(prediction.stopLoss) && !hitPrice) {
              result = "Stop-Loss";
              hitPrice = prediction.stopLoss;
              hitDate = findExactHitTime(open, close, low, hitPrice, candleOpenTime, candleCloseTime);
            } else if (high >= parseFloat(prediction.targets.targetPrice3) && !hitPrice) {
              result = "Hedef 3";
              hitPrice = prediction.targets.targetPrice3;
              hitDate = findExactHitTime(open, close, high, hitPrice, candleOpenTime, candleCloseTime);
            } else if (high >= parseFloat(prediction.targets.targetPrice2) && !hitPrice) {
              result = "Hedef 2";
              hitPrice = prediction.targets.targetPrice2;
              hitDate = findExactHitTime(open, close, high, hitPrice, candleOpenTime, candleCloseTime);
            } else if (high >= parseFloat(prediction.targets.targetPrice1) && !hitPrice) {
              result = "Hedef 1";
              hitPrice = prediction.targets.targetPrice1;
              hitDate = findExactHitTime(open, close, high, hitPrice, candleOpenTime, candleCloseTime);
            }
          } else if (prediction.decision === "Short") {
            if (high >= parseFloat(prediction.stopLoss) && !hitPrice) {
              result = "Stop-Loss";
              hitPrice = prediction.stopLoss;
              hitDate = findExactHitTime(open, close, high, hitPrice, candleOpenTime, candleCloseTime);
            } else if (low <= parseFloat(prediction.targets.targetPrice3) && !hitPrice) {
              result = "Hedef 3";
              hitPrice = prediction.targets.targetPrice3;
              hitDate = findExactHitTime(open, close, low, hitPrice, candleOpenTime, candleCloseTime);
            } else if (low <= parseFloat(prediction.targets.targetPrice2) && !hitPrice) {
              result = "Hedef 2";
              hitPrice = prediction.targets.targetPrice2;
              hitDate = findExactHitTime(open, close, low, hitPrice, candleOpenTime, candleCloseTime);
            } else if (low <= parseFloat(prediction.targets.targetPrice1) && !hitPrice) {
              result = "Hedef 1";
              hitPrice = prediction.targets.targetPrice1;
              hitDate = findExactHitTime(open, close, low, hitPrice, candleOpenTime, candleCloseTime);
            }
          }

          if (hitPrice) break; // İlk vuruşta döngüden çık
        }

        resolve({
          result,
          hitPrice,
          hitDate,
          highestPrice,
          lowestPrice,
          highestDate,
          lowestDate,
        });
      }
    );
  });
}

function getBinanceHistoricalData(
  symbol,
  interval,
  startTime,
  endTime,
  callback
) {
  const allData = [];

  function fetchData(start) {
    const xhr = new XMLHttpRequest();
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${start}&endTime=${endTime}&limit=1500`;

    xhr.open("GET", url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          allData.push(...data);

          if (data.length === 1000) {
            // Daha fazla veri var, bir sonraki batch'i al
            fetchData(data[data.length - 1][0] + 1);
          } else {
            // Tüm veriler alındı, callback'i çağır
            callback(allData);
          }
        } else {
          console.error("API isteği başarısız oldu. Durum kodu:", xhr.status);
          callback(allData); // Hata durumunda mevcut verileri gönder
        }
      }
    };
    xhr.onerror = function () {
      console.error("Ağ hatası oluştu");
      callback(allData); // Ağ hatası durumunda mevcut verileri gönder
    };
    xhr.send();
  }

  fetchData(startTime);
}

function findExactHitTime(
  open,
  close,
  extremePrice,
  targetPrice,
  openTime,
  closeTime
) {
  // Mum içindeki gerçekleşme zamanını tahmin et
  const priceRange = Math.abs(close - open);
  const hitPriceDistance = Math.abs(targetPrice - open);
  const timeRatio = hitPriceDistance / priceRange;
  const timeDifference = closeTime.getTime() - openTime.getTime();
  const estimatedHitTime = new Date(
    openTime.getTime() + timeDifference * timeRatio
  );

  return estimatedHitTime;
}

// Şablon kriptoları tahmin et
function predictTemplateCoins() {
  const templateCoins = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "MATICUSDT",
    "ADAUSDT",
    "PENDLEUSDT",
    "BNXUSDT",
    "SAGAUSDT",
    "DOGEUSDT",
    "DOTUSDT",
    "AVAXUSDT",
    "ARPAUSDT",
  ];
  const investmentAmount = parseFloat(
    document.getElementById("investmentAmount").value
  );
  const leverage = parseInt(document.getElementById("leverage").value);

  if (isNaN(investmentAmount) || investmentAmount <= 0) {
    alert("Lütfen geçerli bir yatırım miktarı girin.");
    return;
  }

  if (isNaN(leverage) || leverage < 1) {
    alert("Lütfen geçerli bir kaldıraç oranı girin.");
    return;
  }

  templateCoins.forEach((coin) => {
    predictCoin(coin, investmentAmount, leverage);
  });

  alert("'Sonuçları Göster' butonuna tıklayın.");
}

// Tek bir kripto için tahmin yap
function predictCoin(selectedCoin, investmentAmount, leverage) {
  getBinanceData(selectedCoin, "5m", 72, function (data) {
    const { decision, rsi, takeProfitPercent, dynamicStopLoss } =
      makeDecision(data);
    const latestPrice = parseFloat(data[data.length - 1][4]);

    const {
      targetPrice1,
      targetPrice2,
      targetPrice3,
      stopLossPrice,
      stopLossPercent,
    } = calculateTargetsAndStopLoss(
      latestPrice,
      decision,
      takeProfitPercent,
      dynamicStopLoss
    );

    // Tahminleri sakla
    savePrediction(
      selectedCoin,
      decision,
      latestPrice,
      { targetPrice1, targetPrice2, targetPrice3 },
      stopLossPrice,
      takeProfitPercent,
      investmentAmount,
      leverage
    );
  });
}

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

function calculateStochasticRSI(data, period = 14, smoothK = 3, smoothD = 3) {
  const rsiValues = calculateRSI(data, period);
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

function calculateVWAP(data) {
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

// Sayfa yüklendiğinde coinleri listele
window.onload = function () {
  getBinanceSymbols(populateSelect);
};
