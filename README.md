# 🚀 Gelişmiş Kripto Para Analiz Sistemi

Bu proje, Bitget API'si kullanarak kripto paraları analiz eden ve otomatik sinyal üreten gelişmiş bir sistemdir.

## ✨ Özellikler

- **12+ Teknik İndikatör**: SMA, EMA, MACD, RSI, Bollinger Bands, ATR, Parabolic SAR, Fibonacci, Ichimoku, Stochastic RSI, Pivot Points, VWAP
- **Otomatik Analiz**: 3 dakikada bir otomatik analiz
- **Gerçek Zamanlı Veriler**: Bitget API'si ile 3m 72 mum verisi
- **Akıllı Karar Verme**: Çoklu sinyal analizi ile %40+ confidence filtreleme
- **24/7 Çalışma**: Vercel serverless fonksiyonları ile kesintisiz hizmet
- **Cron Job**: Otomatik periyodik analizler

## 🛠️ Teknolojiler

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Vercel Serverless Functions
- **API**: Bitget Futures API
- **Deployment**: Vercel Platform
- **Cron Jobs**: Vercel Cron (3 dakikada bir)

## 📊 Analiz Sistemi

### Teknik İndikatörler
- **SMA (20, 50)**: Trend yönü analizi
- **EMA (12, 26)**: Hızlı trend değişimleri
- **MACD**: Momentum ve trend kesişimleri
- **RSI (14)**: Aşırı alım/satım seviyeleri
- **Volume**: Hacim analizi ve momentum

### Karar Verme Algoritması
- Minimum 2 sinyal gerekli
- %40+ confidence eşiği
- Long/Short/Hold kararları
- Dinamik TP/SL hesaplama

## 🚀 Vercel'e Deploy Etme

### 1. GitHub Repository Oluştur
```bash
git init
git add .
git commit -m "İlk commit"
git branch -M main
git remote add origin https://github.com/KULLANICI_ADI/REPO_ADI.git
git push -u origin main
```

### 2. Vercel'e Deploy Et
1. [Vercel.com](https://vercel.com)'a git
2. GitHub ile giriş yap
3. "New Project" tıkla
4. Repository'yi seç
5. Deploy et

### 3. Environment Variables (Opsiyonel)
Vercel dashboard'da şu değişkenleri ekleyebilirsin:
- `CRON_SECRET`: Cron job güvenliği için
- `WEBHOOK_URL`: Sinyal bildirimleri için

## 📱 Kullanım

### Web Arayüzü
- Ana sayfa: `https://YOUR-PROJECT.vercel.app`
- Kripto analiz sayfası: `https://YOUR-PROJECT.vercel.app/crypto-analyzer.html`

### API Endpoints
- **Analiz API**: `/api/analyze?symbol=BTCUSDT`
- **Cron Job**: `/api/cron-analyze` (otomatik)

### Örnek API Kullanımı
```javascript
// Tek sembol analizi
fetch('/api/analyze?symbol=BTCUSDT')
  .then(response => response.json())
  .then(data => console.log(data));

// Sonuç formatı:
{
  "success": true,
  "symbol": "BTCUSDT",
  "analysis": {
    "decision": "Long",
    "confidence": 75,
    "signals": { "long": 4, "short": 1 },
    "details": "SMA Yükseliş Trendi, EMA Yükseliş, MACD Yükseliş Kesişimi",
    "price": 43250.50,
    "timestamp": 1703123456789
  },
  "candleCount": 72
}
```

## ⚙️ Konfigürasyon

### Analiz Parametreleri
- **CANDLE_COUNT**: 72 (3 dakikalık mumlar)
- **CANDLE_INTERVAL**: '3m'
- **CONFIDENCE_THRESHOLD**: 40%
- **MIN_SIGNAL_COUNT**: 2

### Cron Job Ayarları
- **Sıklık**: Her 3 dakikada bir (`*/3 * * * *`)
- **Analiz Edilen Semboller**: BTC, ETH, BNB, ADA, SOL, XRP, DOT, DOGE, AVAX, LINK

## 🔧 Geliştirme

### Lokal Çalıştırma
```bash
# Dependencies yükle
npm install

# Geliştirme sunucusu başlat
npm run dev
```

### Yeni İndikatör Ekleme
1. `api/analyze.js` dosyasında yeni fonksiyon ekle
2. `makeDecision()` fonksiyonunda analiz mantığını güncelle
3. Frontend'de görselleştirme ekle

## 📈 Performans

- **Response Time**: ~500ms
- **Uptime**: %99.9+ (Vercel SLA)
- **Rate Limit**: 100 req/dakika
- **Cold Start**: ~1-2 saniye

## 🛡️ Güvenlik

- CORS koruması
- Rate limiting
- Environment variables
- Cron job authentication

## 📞 Destek

Herhangi bir sorun yaşarsan:
1. GitHub Issues kullan
2. Vercel logs kontrol et
3. API response'ları incele

## 📄 Lisans

MIT License - Özgürce kullanabilirsin!

---

**🎯 Hedef**: 24/7 çalışan, güvenilir kripto analiz sistemi
**🚀 Platform**: Vercel Serverless
**📊 Veri**: Bitget API
**⚡ Hız**: 3 dakikada bir analiz 