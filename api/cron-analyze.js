// Vercel Cron Job - Otomatik Kripto Analiz
import fetch from 'node-fetch';

// Analiz edilecek semboller
const SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'SOLUSDT',
  'XRPUSDT', 'DOTUSDT', 'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT'
];

// Ana cron handler
export default async function handler(req, res) {
  // Sadece Vercel cron job'larından gelen istekleri kabul et
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const results = [];
    
    // Her sembol için analiz yap
    for (const symbol of SYMBOLS) {
      try {
        // Kendi analyze API'mizi çağır
        const analyzeUrl = `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/analyze?symbol=${symbol}`;
        const response = await fetch(analyzeUrl);
        const data = await response.json();
        
        if (data.success && data.analysis.decision !== 'Hold') {
          results.push({
            symbol,
            decision: data.analysis.decision,
            confidence: data.analysis.confidence,
            price: data.analysis.price,
            details: data.analysis.details,
            timestamp: data.timestamp
          });
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }

    // Sonuçları logla
    console.log(`Cron analiz tamamlandı. ${results.length} sinyal bulundu:`, results);

    // Webhook gönder (opsiyonel)
    if (process.env.WEBHOOK_URL && results.length > 0) {
      try {
        await fetch(process.env.WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `🚨 ${results.length} yeni kripto sinyali bulundu!`,
            signals: results,
            timestamp: new Date().toISOString()
          })
        });
      } catch (webhookError) {
        console.error('Webhook gönderme hatası:', webhookError);
      }
    }

    return res.status(200).json({
      success: true,
      message: `${results.length} sinyal bulundu`,
      signals: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cron job hatası:', error);
    return res.status(500).json({
      error: 'Cron job hatası',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
} 