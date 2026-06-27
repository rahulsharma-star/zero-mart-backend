# Zero — Project Roadmap (Version-wise, simple Hindi/Hinglish)

> **Aim:** Inventory-free hyperlocal marketplace. Hum maal store nahi karenge — jinke paas
> dukaan hai unko customer se connect karenge, hum **commission** lenge. Gaav + city dono ke
> liye, aur gaav ke logon ki suvidha ke hisaab se **simple** (zyada English / complicated nahi).

---

## Bade Rules (poore project ki neev)
- **Ek hi app + ek website**, teen tarah ke login: **Customer**, **Vendor (dukaandaar)**, **Delivery boy**.
- Vendor apne products **khud** add karega; **Admin** bhi kisi vendor ke liye add kar sakta hai.
- Vendor ka **web login** bhi hoga (computer se manage), app se bhi.
- **Delivery boys vendor khud** add karega.
- Customer 2 tarah se order kare: (1) **particular vendor** se, (2) **sab vendors ko request** → jo accept kare.
- Languages: **Hindi, English, Marwadi** (aage aur add ho sakti hain).
- **Map/Location baad me** — abhi delivery charge **fixed** (region ke hisaab se).
- **Voice search** har jagah.

---

## ✅ VERSION 1 (ho gaya — abhi banaya)

**Customer Website (`apps/web`)** — React + Vite, mobile-friendly, gaav ke liye simple (bade button, kam text):
- Home: banners + categories + products + "Sab dukaanon se pucho" (broadcast request).
- **Category → aas-paas ki Shops → Shop ke products → View All** (tumhari signature flow).
- Product detail, Cart (single-shop), Checkout (address + COD / online UPI), Orders, Profile.
- **Voice search** (browser mic; Marwadi ke liye Hindi voice fallback).
- **3 languages**: हिंदी / मारवाड़ी / English (switch profile me).
- Phone OTP login (mobile app jaisa hi).

**Backend me jo add hua (V1 ke liye):**
- Nayi APIs: `GET /catalog/stores` (shops list, category ke hisaab se filter), `GET /catalog/stores/:id` (shop detail).
- **Marwadi (mr)** language backend i18n me add (`src/i18n/mr.json`).

> Chalane ke liye: `cd apps/web && cp .env.example .env && npm install && npm run dev` → http://localhost:5174
> (backend bhi chalu hona chahiye.)

---

## 🟡 VERSION 2 (chal raha hai — vendor power + ads)

**✅ DONE — Customer "preferred shops" filter**
- Customer apni settings (Profile) me **1 ya zyada dukaan** chun sakta hai.
- Fir poore app/website me **sirf unhi dukaanon ke products + shops** dikhte hain (home, search, category — sab jagah).
- "Sab dikhao" se filter hata sakta hai. Home par upar saaf indicator dikhta hai jab filter chalu ho.
- Backend me `users.preferred_store_ids` save hota hai → **app aur website dono** me apne aap apply ho jata hai.

**✅ DONE — Per-product extra charge**
- Admin product form me "Extra charge" field. Customer ko final price = base price + extra charge dikhta hai (catalog, cart, order sab me).

**✅ DONE — ₹10 cancellation penalty**
- Order **processing me jaane ke baad** (placed se aage — confirmed/preparing) customer cancel kare to uske **agle order par ₹10** lagta hai, ek hi baar, uske baad clear. Cart/checkout par saaf dikhata hai.

**✅ DONE — Admin me shop lat/lng**
- Admin "Shop" form me Latitude/Longitude → isse V3 ka nearby-shops (distance) feature asli data ke saath kaam karega.

**✅ DONE — Vendor banner / ads system + admin approval**
- Vendor apni dukaan ke liye **banner/ad** banata hai → woh **us shop ke page** par dikhta hai (auto-approved).
- **Home ke liye** vendor ka banner **pending** jata hai → **admin approve/reject** karta hai (home ke liye charge ka idea — abhi approval gate ready).
- **Home par sirf approved** banner dikhte hain. Admin kisi bhi banner ko **"Push to home"** kar sakta hai.
- Ban gaya: banners table me `owner_user_id` / `store_id` / `placement` / `status`; vendor banner API (create/list/delete); admin Banners page me Status + Approve/Reject/Push-to-home; catalog home sirf approved laata hai; shop page par us shop ke banner dikhte hain.
- ⏳ Vendor ka banner **banane wali UI** vendor panel (app/web) ke saath aayegi — abhi API ready hai, aur admin shop ke liye banner bana/approve kar sakta hai.

**✅ DONE — Vendor self-service + web login (B + C)**
- Vendor ab **web panel me login** kar sakta hai (admin wali site par hi, role ke hisaab se alag menu — "My Shop"). Sirf apni dukaan dikhe.
- **My Products:** vendor khud product add/edit/delete kare (naam en/hi/marwadi, price, extra charge, mrp, stock, photo, category).
- **Orders:** apne shop ke orders dekhe + Accept/Reject + preparing/ready mark kare.
- **Banners:** apne banner banaye (shop = auto, home = admin approval).
- Backend: `/vendor/products` (CRUD), `/vendor/categories`, vendor login allowed.

**✅ DONE (admin side) — Admin kisi vendor ke liye product daale (D)**
- Admin product form me pehle se "Shop chuno" field hai → admin kisi bhi shop ke liye product daal sakta hai.

**E. Vendor per-product extra charge** — product me extra charge field; final price = base + extra.

**F. Cancellation penalty (₹10)** — order **processing** me jaane ke baad cancel kiya → **agle order** par ₹10 extra, uske baad nahi.

**G. Vendor apne delivery boys khud add kare.**

**H. Marwadi *content*** — abhi sirf server messages Marwadi me hain; product/category naam abhi en/hi me hain. Admin me Marwadi field add karke content bhi Marwadi me.

---

## 🟢 VERSION 3 (chal raha hai)

**✅ DONE — Location se nearby shops (bina paid API)**
- Website par "📍 मेरी जगह इस्तेमाल करें" button → browser GPS se customer ki location.
- Aas-paas ki dukaanein **asli doori (km) ke hisaab se** sort hoti hain, har shop par "X कि.मी." dikhta hai.
- Backend Haversine formula se distance nikalta hai (`/catalog/stores?lat=&lng=`), koi Google Maps key nahi chahiye.
- Delivery charge abhi **fixed** hi (jaise socha tha). Location preference browser me save rehti hai.
- ⚠️ Distance dikhne ke liye **har dukaan ka lat/lng hona zaroori hai** (seed/admin me). Bina coords wali shops list me aage rehti hain.

**Baaki V3 (jab keys/API milein):**
- **Full Map API** — address autocomplete + map picker + pincode→location, aur delivery charge location ke hisaab se (Google Maps key chahiye).
- **Asli SMS OTP** (MSG91 keys).
- **Online payment (PayU)** production keys ke saath.
- Aur languages.

---

## Gaav-friendly design (har version me dhyaan)
Bade text aur buttons, har jagah 🎤 voice, pictures/icons zyada, English kam, language switch saaf,
order 2-3 tap me.

*Note: purane README "single-store e-commerce" kehte hain par code marketplace hai — README baad me update karna.*
