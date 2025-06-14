# Yeni Trading Stratejisi: EMA + Volume + Order Book Yaklaşımı

## Yaptığımız Değişiklikler

1. RSI ve VWAP indikatorleri tamamen kaldırıldı
2. Stochastic RSI hesaplamaları devre dışı bırakıldı
3. Strateji sadece aşağıdaki göstergeleri kullanıyor:
   - EMA indikatörleri (9, 21)
   - Volume (hacim) analizi
   - Order Book desteği/direnci

## Sadələşdirilmiş Xal Sistemi

### LONG mövqeyi üçün:
- EMA(9) > EMA(21) → +1 xal
- Volume spike → +2 xal
- Buy Wall mövcuddursa → +2 xal

### SHORT mövqeyi üçün:
- EMA(9) < EMA(21) → +1 xal
- Volume spike → +2 xal
- Sell Wall mövcuddursa → +2 xal

### Qərar:
- Əgər toplam xal ≥ 4-dürsə, mövqe açılır

## Üstünlükləri

- Sadə və anlaşılan qərar sistemi
- Təkcə 3 əsas indikatora diqqət
- Hacim və order book analizi daha çox əhəmiyyət daşıyır
- EMA ilə baza trend istiqamətini müəyyən edir
- Daha az yanlış siqnal, daha dəqiq ticarət qərarları

Bu yeni sistem daha sadə və fokuslanmış bir stratejiya ilə işləyir, beləliklə ticarət qərarları daha aydın və asan başa düşülən olur.
