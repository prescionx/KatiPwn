// ==UserScript==
// @name         KatiPwn - katiponline.com Klavye hız testi POST Interceptorü.
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Katiponline.com klavye hız testi sayfasında, oyun sonuçlarını kaydeden POST isteklerini yakalayan, engelleyen ve özelleştirilmiş istekler gönderebilen gelişmiş bir kullanıcı scripti. Lütfen, katiponline.com'un kullanım şartlarına ve etik kurallarına uygun şekilde kullanın. Bu script, eğitim amaçlı geliştirilmiştir ve geliştiriciler, kötüye kullanımından sorumlu tutulamaz.
// @author       PrescionX
// @match        https://katiponline.com/klavye-hiz-testi/*
// @grant        none
// ==/UserScript==
// All i need is roses... Roses, 0:29 (Imanbek Remix) https://music.youtube.com/watch?v=nh4AY6U00J8   

(function() {
    'use strict';

    // --- GHOST KERNEL ---

    const GhostKernel = {
        state: {
            requests: [],       
            lastToken: null,    // En son yakalanan calisma_token
            gameDuration: 60,  
            startTime: null,   
            isBlocking: false,  
            isAutoSubmit: false,
            builderData: {},    
            hudActive: false
        },

        init: function() {
            console.log("GhostKernel: Başlatılıyor...");
            this.hookNetwork();
            this.injectHUDStyles();
            this.injectTriggerButton();

            window.addEventListener('message', (e) => this.handleMessage(e));

            // Shift+K ile popup aç
            document.addEventListener('keydown', (e) => {
                if (e.shiftKey && e.code === 'KeyK' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    e.preventDefault();
                    this.openPopup();
                }
            });
        },

        // Interceptor
        hookNetwork: function() {
            const self = this;
            const originalXHROpen = XMLHttpRequest.prototype.open;
            const originalXHRSend = XMLHttpRequest.prototype.send;
            const originalFetch = window.fetch;

            // XHR Hook
            XMLHttpRequest.prototype.open = function(method, url) {
                this._method = method;
                this._url = url;
                this._headers = {};
                return originalXHROpen.apply(this, arguments);
            };

            const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
            XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
                 this._headers[header] = value;
                 return originalSetRequestHeader.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function(body) {
                const xhr = this;
                const url = this._url || "";

                // Bypass Kontrolü
                const isBypass = this._headers && (this._headers['X-Bypass-Interceptor'] === 'true');

                // 1. islemler.php POST Yakalama
                if (url.includes('islemler.php') && body && typeof body === 'string' && body.includes('islem=calisma_baslat')) {
                    this.addEventListener('load', function() {
                        self.processStartResponse(this.responseText);
                    });
                }

                // 2. sonuckaydet.php Yakalama 
                if (url.includes('sonuckaydet.php') && !isBypass) {
                    // Eğer Blocker veya Auto-Submit açıksan müdahale et
                    if (self.state.isBlocking || self.state.isAutoSubmit) {
                        console.warn(`GhostKernel: Orijinal istek BLOKLANDI! -> ${url}`);

                        // Logla
                        self.logRequest('XHR', 'POST', url, body, true); // Blocked = true

                        // Auto-Submit Tetikleyicisi (PUSU MANTIĞI)
                        if (self.state.isAutoSubmit) {
                            console.log("GhostKernel: Auto-Submit Pusu Modu Tetiklendi! Custom istek gönderiliyor...");
                            self.triggerAutoSubmit();
                        }

                        // Network Error simülasyonu
                         Object.defineProperty(this, 'readyState', { writable: true });
                         Object.defineProperty(this, 'status', { writable: true });
                         this.readyState = 4;
                         this.status = 0;
                         this.dispatchEvent(new Event('error'));
                         return; // send işlemi gg
                    }
                }

                let reqId = null;
                if (!isBypass) {
                    reqId = self.logRequest('XHR', this._method, url, body, false);
                }

                if (reqId) {
                    this.addEventListener('load', function() {
                        self.updateRequestResponse(reqId, this.responseText, this.status);
                    });
                    this.addEventListener('error', function() {
                        self.updateRequestResponse(reqId, "Network Error", 0);
                    });
                }

                return originalXHRSend.apply(this, arguments);
            };

            // Fetch Hook 
            window.fetch = async function(input, init) {
                const url = (typeof input === 'string') ? input : input.url;
                const method = (init && init.method) ? init.method : 'GET';
                const body = (init && init.body) ? init.body : null;
                const headers = (init && init.headers) ? init.headers : {};

                // Bypass Kontrolü
                let isBypass = false;
                if (headers instanceof Headers) isBypass = headers.get('X-Bypass-Interceptor') === 'true';
                else if (headers['X-Bypass-Interceptor'] === 'true') isBypass = true;

                if (url.includes('sonuckaydet.php') && !isBypass) {
                    if (self.state.isBlocking || self.state.isAutoSubmit) {
                        console.warn(`GhostKernel: Fetch isteği BLOKLANDI! -> ${url}`);
                        self.logRequest('FETCH', method, url, body, true);

                        if (self.state.isAutoSubmit) {
                            self.triggerAutoSubmit();
                        }

                        return Promise.reject(new Error("GhostKernel Blocked"));
                    }
                }

                let reqId = null;
                if (!isBypass) {
                    reqId = self.logRequest('FETCH', method, url, body, false);
                }

                try {
                    const response = await originalFetch.apply(this, arguments);
                    const clone = response.clone();

                    if (url.includes('islemler.php')) {
                        clone.text().then(text => self.processStartResponse(text));
                    }

                    if (reqId) {
                         const respClone = response.clone();
                         respClone.text().then(text => {
                             self.updateRequestResponse(reqId, text, response.status);
                         });
                    }

                    return response;
                } catch (err) {
                    if (reqId) {
                         self.updateRequestResponse(reqId, "Fetch Error: " + err.message, 0);
                    }
                    throw err;
                }
            };
        },

        // Helper: Başlatma Yanıtını İşle
        processStartResponse: function(responseText) {
            try {
                let token = null;
                // JSON veya Regex ile token bul
                try {
                    const json = JSON.parse(responseText);
                    token = json.calisma_token || json.token;
                } catch(e) {
                    const match = responseText.match(/calisma_token["']?\s*:\s*["']?([^"'}]+)["']?/);
                    if (match) token = match[1];
                }

                if (token) {
                    this.state.lastToken = token;

                    // DOM'dan süre bilgisini çek
                    const sureEl = document.querySelector(".surebilgisi:checked");
                    const duration = sureEl ? parseInt(sureEl.getAttribute("data-sure")) : 60;
                    this.state.gameDuration = duration;
                    this.state.startTime = Date.now();

                    console.log(`GhostKernel: Oyun Başladı! Token: ${token}, Süre: ${duration}sn`);

                    HUDManager.show(duration);

                    // UI'a haber ver
                    this.broadcast({
                        type: 'GAME_STARTED',
                        token: token,
                        duration: duration
                    });
                }
            } catch (err) {
                console.error("GhostKernel: Token parse hatası", err);
            }
        },

        logRequest: function(type, method, url, body, blocked) {
            const reqData = {
                id: Date.now() + Math.random(), // Unique ID
                type, method, url, body, blocked,
                timestamp: Date.now(),
                response: null,
                status: null
            };
            this.state.requests.unshift(reqData); // En başa ekle

            // UI Açıksa oraya da gönder
            this.broadcast({
                type: 'NEW_REQUEST',
                request: reqData
            });

            return reqData.id;
        },

        updateRequestResponse: function(id, response, status) {
             const req = this.state.requests.find(r => r.id === id);
             if (req) {
                 req.response = response;
                 req.status = status;
                 this.broadcast({
                     type: 'UPDATE_REQUEST',
                     id: id,
                     response: response,
                     status: status
                 });
             }
        },

        // Helper: Manuel Token İste
        requestNewToken: function() {
            console.log("GhostKernel: Yeni token isteniyor...");
            window.fetch('https://katiponline.com/klavye-hiz-testi/islemler.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                body: 'islem=calisma_baslat'
            }).then(res => res.text()).then(text => {
                console.log("GhostKernel: Yeni token yanıtı:", text);

                let token = null;
                try {
                    const json = JSON.parse(text);
                    token = json.calisma_token || json.token;
                } catch(e) {
                     const match = text.match(/calisma_token["']?\s*:\s*["']?([^"'}]+)["']?/);
                     if (match) token = match[1];
                }

                if (token) {
                    this.state.lastToken = token;
                    if (!this.state.builderData) this.state.builderData = {};
                    this.state.builderData.calisma_token = token;

                    this.broadcast({ type: 'REFRESH_DONE', data: this.state.builderData });
                    this.broadcast({ type: 'LOG', message: "Token Alındı!" });
                } else {
                    this.broadcast({ type: 'LOG', message: "Token Alınamadı!" });
                }
            }).catch(err => {
                console.error("GhostKernel: Token isteği hatası", err);
                this.broadcast({ type: 'LOG', message: "Token Hatası!" });
            });
        },

        // Helper: Auto-Submit Tetikleyici
        triggerAutoSubmit: function() {
            // Builder verilerini tazeleyelim (kullanıcı UI'dan değiştirmiş olabilir, veya varsayılanlar)
            // Eğer UI açıksa, UI'daki formu esas al. Kapalıysa, state.builderData'yı kullan.
            // En güvenlisi: state.builderData her zaman güncel tutulmalı.

            // Eğer builderData boşsa, acil durum refresh'i yap
            if (!this.state.builderData || Object.keys(this.state.builderData).length === 0) {
                this.refreshBuilderData();
            }

            const payload = { ...this.state.builderData };

            // Token kontrolü
            if (!payload.calisma_token && this.state.lastToken) {
                payload.calisma_token = this.state.lastToken;
            }

            console.log("GhostKernel: Auto-Submit Payload Hazırlanıyor...", payload);

            // POST İsteği At
            const params = new URLSearchParams();
            for (const key in payload) {
                params.append(key, payload[key]);
            }

            const url = 'https://katiponline.com/klavye-hiz-testi/sonuckaydet.php';
            const body = params.toString();

            // Log Request
            const reqId = this.logRequest('FETCH', 'POST', url, body, false);

            window.fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Bypass-Interceptor': 'true'
                },
                body: body
            }).then(res => {
                const status = res.status;
                return res.text().then(text => ({ text, status }));
            }).then(({ text, status }) => {
                console.log("GhostKernel: Auto-Submit BAŞARILI!", text);
                this.broadcast({ type: 'LOG', message: "OTO-GÖNDER BAŞARILI!" });

                // Update Log with Response
                this.updateRequestResponse(reqId, text, status);
            }).catch(err => {
                console.error("GhostKernel: Auto-Submit HATASI", err);
                this.broadcast({ type: 'LOG', message: "OTO-GÖNDER HATASI!" });

                // Update Log with Error
                this.updateRequestResponse(reqId, err.message, 0);
            });
        },

        // Helper: DOM'dan Veri Tazeleme (Refresh Logic)
        refreshBuilderData: function() {
            // Ana sayfadan verileri çek
            const saniyeEl = document.querySelector(".surebilgisi:checked");
            const metinEl = document.querySelector(".metinsecimi");

            const data = {
                calisma_token: this.state.lastToken || "",
                metingrububilgisi: "", // Boş kalmalı
                saniyebilgisi: saniyeEl ? saniyeEl.getAttribute("data-sure") : "60",
                baslik: "Klavye Hız Testi",
                sure: "1:00",
                metin: metinEl ? metinEl.value.substring(0, 50) + "..." : "...",
                dogru: 120,
                yanlis: 0,
                dtv: 700,
                ytv: 0,
                yarisma_puani: 120,
                imla: "imlasiz"
            };

            // Süre formatla
            const sec = parseInt(data.saniyebilgisi);
            const m = Math.floor(sec/60).toString().padStart(2, '0');
            const s = (sec%60).toString().padStart(2, '0');
            data.sure = `${m}:${s}`;

            this.state.builderData = data;
            return data;
        },

        // UI <-> Kernel
        broadcast: function(msg) {
            if (this.popupWindow && !this.popupWindow.closed) {
                this.popupWindow.postMessage(msg, '*');
            }
        },

        handleMessage: function(event) {
            const msg = event.data;
            if (!msg) return;

            switch(msg.type) {
                case 'GET_INIT_STATE':
                    // UI açıldığında ona mevcut durumu gönder
                    this.popupWindow = event.source;
                    this.broadcast({
                        type: 'INIT_STATE',
                        state: this.state
                    });
                    break;
                case 'UPDATE_CONFIG':
                    // Toggle değişimleri
                    if (msg.key === 'isBlocking') this.state.isBlocking = msg.value;
                    if (msg.key === 'isAutoSubmit') {
                        this.state.isAutoSubmit = msg.value;
                        // Synergy: Auto-Submit ON ise Blocking de ON olmalı
                        if (msg.value) {
                            this.state.isBlocking = true;
                            this.broadcast({ type: 'FORCE_BLOCKER', value: true });
                        }
                    }
                    break;
                case 'UPDATE_BUILDER':
                    // Builder formundaki değişiklikleri kaydet
                    this.state.builderData = msg.data;
                    break;
                case 'MANUAL_REFRESH':
                    // Kullanıcı refresh butonuna bastı
                    const freshData = this.refreshBuilderData();
                    this.broadcast({ type: 'REFRESH_DONE', data: freshData });
                    break;
                case 'MANUAL_SEND':
                    // Manuel gönder butonu (Target Page'den)
                    this.state.builderData = msg.data; // Son veriyi al
                    this.triggerAutoSubmit();
                    break;
                case 'REQUEST_NEW_TOKEN':
                    this.requestNewToken();
                    break;
                case 'GET_TOP_SCORERS':
                    this.fetchTopScorers();
                    break;
                case 'PING':
                    this.broadcast({ type: 'PONG', timestamp: Date.now() });
                    break;
                case 'GET_USERNAME': {
                    let uname = null;
                    // Find <li><p>email@...</p></li> on the page
                    const allP = document.querySelectorAll('li > p');
                    for (const p of allP) {
                        const text = p.textContent.trim();
                        if (text && text.includes('@')) {
                            uname = text;
                            break;
                        }
                    }
                    if (!uname) {
                        const profileEl = document.querySelector('.username, .profil-adi, [class*="username"], [class*="kullanici"]');
                        if (profileEl) uname = profileEl.textContent.trim();
                    }
                    this.broadcast({ type: 'USERNAME_RESULT', username: uname });
                    break;
                }
            }
        },

        fetchTopScorers: function() {
            const durations = ['1:00', '3:00', '5:00'];
            const results = {};
            let completed = 0;

            durations.forEach(sure => {
                const params = new URLSearchParams();
                params.append('islem', 'hizlilari_getir');
                params.append('sure', sure);
                params.append('tarih', 'hepsi');

                window.fetch('https://katiponline.com/klavye-hiz-testi/islemler.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: params.toString()
                })
                .then(res => res.text())
                .then(text => {
                    results[sure] = text;
                })
                .catch(err => {
                    results[sure] = "Error";
                })
                .finally(() => {
                    completed++;
                    if (completed === durations.length) {
                        this.broadcast({ type: 'TOP_SCORERS_RESULT', data: results });
                    }
                });
            });
        },

        openPopup: function() {
            const win = window.open('', 'kht_ghost_panel', 'width=900,height=800');
            if (win) {
                UIManager.render(win);
                this.popupWindow = win;
            } else {
                alert("Lütfen popup izni verin!");
            }
        },

        injectTriggerButton: function() {
            const btn = document.createElement('button');
            btn.textContent = 'KatiPwn (Shift+K)';
            btn.style.cssText = `
                position: fixed; bottom: 20px; left: 20px; z-index: 99999;
                padding: 10px 20px; background: rgba(0,0,0,0.8); color: #00ff41;
                border: 1px solid #00ff41; font-family: monospace; cursor: pointer;
                box-shadow: 0 0 10px #00ff41; backdrop-filter: blur(5px);
                transition: all 0.3s;
            `;
            btn.onmouseover = () => btn.style.boxShadow = "0 0 20px #00ff41";
            btn.onmouseout = () => btn.style.boxShadow = "0 0 10px #00ff41";

            btn.onclick = () => this.openPopup();
            document.body.appendChild(btn);
        },

        injectHUDStyles: function() {
            const style = document.createElement('style');
            style.textContent = `
                #ghost-hud {
                    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                    z-index: 10000; display: flex; flex-direction: column; gap: 5px;
                    pointer-events: none; opacity: 0; transition: opacity 0.5s;
                }
                .hud-bar {
                    background: rgba(0,0,0,0.7); border: 1px solid #00ff41;
                    padding: 5px 15px; border-radius: 4px; display: flex; align-items: center;
                    gap: 10px; color: #fff; font-family: monospace; font-size: 14px;
                    box-shadow: 0 0 10px rgba(0,255,65,0.2); backdrop-filter: blur(4px);
                }
                .hud-time { font-weight: bold; font-size: 18px; color: #00ff41; }
                .hud-label { font-size: 10px; color: #aaa; text-transform: uppercase; }
                .hud-safe { border-color: #ff00de; box-shadow: 0 0 10px rgba(255,0,222,0.2); }
                .hud-safe .hud-time { color: #ff00de; }
            `;
            document.head.appendChild(style);
        }
    };

    // --- HUD YÖNETİCİSİ (ANA EKRAN) ---
    const HUDManager = {
        el: null,
        intervals: [],

        create: function() {
            if (document.getElementById('ghost-hud')) return;
            const container = document.createElement('div');
            container.id = 'ghost-hud';
            container.innerHTML = `
                <div class="hud-bar">
                    <span class="hud-label">Orijinal</span>
                    <span class="hud-time" id="hud-orig">00:00</span>
                </div>
                <div class="hud-bar hud-safe">
                    <span class="hud-label">+5sn Safe</span>
                    <span class="hud-time" id="hud-safe">00:00</span>
                </div>
            `;
            document.body.appendChild(container);
            this.el = container;
        },

        show: function(duration) {
            this.create();
            this.el.style.opacity = '1';

            // Temizle
            this.intervals.forEach(clearInterval);
            this.intervals = [];

            let originalTime = duration;
            let safeTime = duration + 5;

            const update = () => {
                const fmt = (t) => {
                    if (t < 0) return "00:00";
                    const m = Math.floor(t / 60).toString().padStart(2,'0');
                    const s = (t % 60).toString().padStart(2,'0');
                    return `${m}:${s}`;
                };

                document.getElementById('hud-orig').textContent = fmt(originalTime);
                document.getElementById('hud-safe').textContent = fmt(safeTime);

                if (originalTime > 0) originalTime--;
                if (safeTime > 0) safeTime--;

                if (safeTime < 0) {
                    this.el.style.opacity = '0';
                    this.intervals.forEach(clearInterval);
                }
            };

            update(); // İlk render
            this.intervals.push(setInterval(update, 1000));
        }
    };

    // --- UI YÖNETİCİSİ (POPUP) ---
    const UIManager = {
        render: function(win) {
            const doc = win.document;
            doc.open();
            doc.write(`
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>KatiPwn version 1.0</title>
    <style>
        :root {
            --bg: #050505;
            --glass: rgba(20, 20, 20, 0.6);
            --border: rgba(255, 255, 255, 0.1);
            --neon-green: #00ff41;
            --neon-pink: #ff00de;
            --neon-red: #ff2a2a;
            --text: #e0e0e0;
        }
        body {
            background-color: var(--bg);
            color: var(--text);
            font-family: 'Segoe UI', 'Courier New', monospace;
            margin: 0; padding: 0;
            overflow: hidden;
            background-image:
                linear-gradient(rgba(0, 255, 65, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 255, 65, 0.03) 1px, transparent 1px);
            background-size: 20px 20px;
        }
        /* Glassmorphism Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: var(--neon-green); border-radius: 3px; }

        /* Modal Styles */
        .modal {
            display: none; position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%;
            background-color: rgba(0,0,0,0.7); backdrop-filter: blur(5px);
            align-items: center; justify-content: center;
        }
        .modal-content {
            background-color: #111; border: 1px solid var(--neon-green);
            width: 80%; max-width: 800px; max-height: 80%;
            display: flex; flex-direction: column;
            box-shadow: 0 0 20px rgba(0, 255, 65, 0.2);
            border-radius: 8px; overflow: hidden;
        }
        .modal-header {
            padding: 15px; background: rgba(0, 255, 65, 0.1);
            border-bottom: 1px solid var(--border);
            display: flex; justify-content: space-between; align-items: center;
        }
        .modal-title { font-weight: bold; color: var(--neon-green); }
        .close-modal { color: #aaa; font-size: 24px; cursor: pointer; }
        .close-modal:hover { color: #fff; }
        .modal-body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 15px; }
        .detail-row { display: flex; flex-direction: column; gap: 5px; }
        .detail-label { font-size: 11px; color: var(--neon-pink); text-transform: uppercase; }
        .detail-val {
            background: rgba(255,255,255,0.05); padding: 10px; border-radius: 4px;
            font-family: monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all;
            border: 1px solid #333;
        }

        .app-container {
            display: grid;
            grid-template-columns: 300px 1fr;
            height: 100vh;
            gap: 1px;
        }

        /* Sidebar (Interceptor List) */
        .sidebar {
            background: var(--glass);
            backdrop-filter: blur(10px);
            border-right: 1px solid var(--border);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .sidebar-header {
            padding: 15px;
            font-size: 14px;
            font-weight: bold;
            color: var(--neon-pink);
            border-bottom: 1px solid var(--border);
            text-shadow: 0 0 5px var(--neon-pink);
            letter-spacing: 1px;
        }
        #req-list {
            flex: 1;
            overflow-y: auto;
            list-style: none;
            padding: 0; margin: 0;
        }
        .req-item {
            padding: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            cursor: pointer;
            transition: 0.2s;
            font-size: 12px;
            position: relative;
        }
        .req-item:hover { background: rgba(0, 255, 65, 0.1); }
        .req-item.blocked { border-left: 3px solid var(--neon-red); background: rgba(255, 42, 42, 0.1); }
        .req-time { color: #666; font-size: 10px; margin-bottom: 3px; display: block; }
        .req-method { font-weight: bold; margin-right: 5px; }
        .req-url { color: var(--neon-green); word-break: break-all; }
        .req-status { font-weight: bold; font-size: 11px; margin-top: 5px; }
        .req-msg { font-size: 10px; color: #aaa; margin-top: 2px; white-space: pre-wrap; }

        .status-success { color: var(--neon-green); }
        .status-warn { color: yellow; }
        .status-error { color: var(--neon-red); }
        .status-unknown { color: cyan; }

        .icon { width: 14px; height: 14px; fill: currentColor; vertical-align: middle; margin-right: 5px; }
        .icon.large { width: 18px; height: 18px; }

        /* Leaderboard */
        .leaderboard {
            padding: 10px; border-top: 1px solid var(--border);
            font-size: 11px; display: flex; flex-direction: column; gap: 5px;
        }
        .leader-item {
            display: flex; align-items: center; gap: 10px;
            background: rgba(255,255,255,0.05); padding: 5px; border-radius: 4px;
        }
        .leader-img { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
        .leader-info { display: flex; flex-direction: column; }
        .leader-name { font-weight: bold; color: var(--neon-pink); }
        .leader-score { color: var(--neon-green); }
        .leader-emoji { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 16px; background: rgba(255,255,255,0.1); }

        /* Main Content (Builder) */
        .main {
            background: rgba(10, 10, 10, 0.4);
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        /* Paneller */
        .glass-panel {
            background: rgba(30, 30, 30, 0.4);
            backdrop-filter: blur(15px);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5);
            position: relative;
        }
        .panel-title {
            position: absolute;
            top: -10px; left: 15px;
            background: var(--bg);
            padding: 0 5px;
            color: var(--neon-green);
            font-size: 12px;
            font-weight: bold;
            border: 1px solid var(--neon-green);
            border-radius: 4px;
        }

        /* Switches */
        .switch-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding: 10px;
            border-radius: 6px;
            background: rgba(0,0,0,0.3);
        }
        .switch-row.red { border: 1px solid rgba(255, 42, 42, 0.3); }
        .switch-row.green { border: 1px solid rgba(0, 255, 65, 0.3); }

        .switch-label { font-weight: bold; font-size: 13px; }
        .switch {
            position: relative; display: inline-block; width: 40px; height: 20px;
        }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
            background-color: #333; transition: .4s; border-radius: 20px;
        }
        .slider:before {
            position: absolute; content: ""; height: 14px; width: 14px;
            left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%;
        }
        input:checked + .slider { background-color: var(--neon-green); }
        .red input:checked + .slider { background-color: var(--neon-red); }
        input:checked + .slider:before { transform: translateX(20px); }
        input:disabled + .slider { opacity: 0.5; cursor: not-allowed; }

        /* Form Grid */
        .form-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 15px;
        }
        .input-group { display: flex; flex-direction: column; gap: 5px; }
        .input-group label { font-size: 11px; color: #888; text-transform: uppercase; }
        .input-group input, .input-group textarea {
            background: rgba(0,0,0,0.5);
            border: 1px solid #333;
            color: var(--neon-green);
            padding: 8px;
            border-radius: 4px;
            font-family: inherit;
        }
        .input-group input:focus { border-color: var(--neon-green); outline: none; }
        .full-width { grid-column: span 2; }

        /* Buttons */
        .cyber-btn {
            background: transparent;
            color: var(--neon-green);
            border: 1px solid var(--neon-green);
            padding: 10px;
            font-weight: bold;
            cursor: pointer;
            text-transform: uppercase;
            transition: 0.3s;
            letter-spacing: 1px;
            margin-top: 10px;
            position: relative;
            overflow: hidden;
        }
        .cyber-btn:hover { background: var(--neon-green); color: #000; box-shadow: 0 0 15px var(--neon-green); }

        .refresh-btn {
            float: right;
            font-size: 10px;
            padding: 2px 8px;
            border-color: var(--neon-pink);
            color: var(--neon-pink);
        }
        .refresh-btn:hover { background: var(--neon-pink); color: #fff; box-shadow: 0 0 10px var(--neon-pink); }

        .profile-badges {
            display: flex; gap: 10px; margin-bottom: 10px;
        }
        .badge {
            font-size: 10px; padding: 4px 8px; border: 1px solid #444;
            cursor: pointer; border-radius: 10px; transition: 0.2s;
        }
        .badge:hover { border-color: #fff; }
        .badge.active { background: var(--neon-green); color: #000; border-color: var(--neon-green); }

        #log-area {
            font-size: 11px; color: #aaa; margin-top: 10px; height: 20px; overflow: hidden; white-space: nowrap;
        }

    </style>
</head>
<body>
    <div class="app-container">
        <!-- SIDEBAR -->
        <div class="sidebar">
            <div class="sidebar-header">
                <svg class="icon large" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-.61.08-1.21.21-1.78L8.99 15v1c0 1.1.9 2 2 2v1.93C7.06 19.43 4 16.07 4 12zm13.89 5.4c-.26-.81-1-1.4-1.9-1.4h-1v-3c0-.55-.45-1-1-1h-6v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41C17.92 5.77 20 8.65 20 12c0 2.05-.81 3.93-2.11 5.4z"/></svg>
                AĞ İZLEME GEÇMİŞİ
            </div>
            <ul id="req-list">
                <!-- İstekler buraya gelecek -->
            </ul>

            <div class="leaderboard" id="leaderboard-area">
                <button class="cyber-btn" id="btn-top-scorers" style="margin-top:0; font-size:10px; padding:5px;">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M20.2 2H3.8c-1.1 0-1.9.9-1.8 1.9.9 7.7 7.4 13.6 15 13.6s14.1-5.9 15-13.6c.1-1.1-.7-2-1.8-1.9zM7 7.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zM12 13c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4zm7-5.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zM6 19h12v2H6z"/></svg>
                    BİRİNCİLERİ GETİR
                </button>
                <div id="leaderboard-content"></div>
            </div>
        </div>

        <!-- MAIN -->
        <div class="main">

            <div style="margin-bottom: 10px; font-size: 12px; color: #888;">
                Giriş yapıldı: <span id="username-display" style="color: var(--neon-green); font-weight: bold;">...</span>
            </div>

            <!-- AYARLAR -->
            <div class="glass-panel">
                <span class="panel-title">SİSTEM KONTROLÜ</span>

                <div class="switch-row green">
                    <span class="switch-label">OTO-GÖNDER (Auto-Submit)</span>
                    <label class="switch">
                        <input type="checkbox" id="toggle-autosubmit">
                        <span class="slider"></span>
                    </label>
                </div>

                <div class="switch-row red">
                    <span class="switch-label">BLOKLAYICI (Request Blocker)</span>
                    <label class="switch">
                        <input type="checkbox" id="toggle-blocker">
                        <span class="slider"></span>
                    </label>
                </div>

                <div style="font-size: 10px; color: #666; margin-top: 5px;">
                    * Auto-Submit açıldığında Blocker otomatik kilitlenir.
                </div>
            </div>

            <!-- REQUEST BUILDER -->
            <div class="glass-panel">
                <span class="panel-title">İSTEK OLUŞTURUCU (BUILDER)</span>

                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="profile-badges">
                        <span class="badge" onclick="setProfile('normal')">NORMAL (60)</span>
                        <span class="badge" onclick="setProfile('pro')">PRO (110)</span>
                        <span class="badge" onclick="setProfile('god')">GOD (200+)</span>
                    </div>
                    <button class="cyber-btn refresh-btn" id="btn-refresh">MANUEL YENİLE</button>
                </div>

                <div class="form-grid" id="builder-form">
                    <div class="input-group full-width">
                        <label>Çalışma Token</label>
                        <div style="display: flex; gap: 5px;">
                            <input type="text" id="calisma_token" readonly style="opacity: 0.7; flex: 1;">
                            <button class="cyber-btn" id="btn-request-token" style="font-size: 10px; padding: 5px; margin: 0;">TOKEN İSTE</button>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>Doğru Kelime</label>
                        <input type="number" id="dogru" value="120">
                    </div>
                    <div class="input-group">
                        <label>Yanlış Kelime</label>
                        <input type="number" id="yanlis" value="0">
                    </div>

                    <div class="input-group">
                        <label>Süre (mm:ss)</label>
                        <input type="text" id="sure" value="01:00">
                    </div>
                    <div class="input-group">
                        <label>Saniye (sn)</label>
                        <input type="number" id="saniyebilgisi" value="60">
                    </div>

                    <div class="input-group">
                        <label>Puan</label>
                        <input type="number" id="yarisma_puani" value="120">
                    </div>

                    <div class="input-group">
                        <label>DTV (Doğru Tuş)</label>
                        <input type="number" id="dtv" value="700">
                    </div>
                    <div class="input-group">
                        <label>YTV (Yanlış Tuş)</label>
                        <input type="number" id="ytv" value="0">
                    </div>

                    <div class="input-group full-width">
                        <label>Metin Önizleme</label>
                        <input type="text" id="metin" readonly style="opacity: 0.5;">
                    </div>

                    <!-- Gizli alanlar -->
                    <input type="hidden" id="metingrububilgisi" value="">
                    <input type="hidden" id="baslik" value="">
                    <input type="hidden" id="imla" value="">
                </div>

                <button class="cyber-btn" id="btn-send" style="width: 100%;">BU VERİLERLE GÖNDER</button>
                <div id="log-area">Sistem Hazır.</div>
            </div>

        </div>
    </div>

    <!-- REQUEST MODAL -->
    <div id="request-modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <span class="modal-title">İSTEK DETAYI</span>
                <span class="close-modal" onclick="closeModal()">&times;</span>
            </div>
            <div class="modal-body" id="modal-details">
                <!-- Javascript ile doldurulacak -->
            </div>
        </div>
    </div>

    <script>
        // --- İLETİŞİM KATMANI ---
        const opener = window.opener;

        // ICONS (SVG)
        const Icons = {
            wifi: '<svg class="icon" viewBox="0 0 24 24"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>',
            upload: '<svg class="icon" viewBox="0 0 24 24"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>',
            check: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
            warn: '<svg class="icon" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
            error: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>',
            unknown: '<svg class="icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>',
            key: '<svg class="icon" viewBox="0 0 24 24"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>'
        };

        // Username Init via postMessage
        let usernameReceived = false;
        let usernameTimeout = null;

        // Notification helper
        function showNotification(text, type) {
            const notif = document.createElement('div');
            notif.style.cssText = 'position:fixed;top:10px;right:10px;z-index:99999;padding:12px 20px;border-radius:6px;font-size:12px;font-family:monospace;color:#fff;opacity:0;transition:opacity 0.3s;max-width:350px;';
            if (type === 'error') notif.style.background = 'rgba(255,42,42,0.9)';
            else if (type === 'success') notif.style.background = 'rgba(0,255,65,0.15)';
            else notif.style.background = 'rgba(0,0,0,0.8)';
            notif.style.border = '1px solid ' + (type === 'error' ? '#ff2a2a' : type === 'success' ? '#00ff41' : '#555');
            notif.textContent = text;
            document.body.appendChild(notif);
            setTimeout(() => notif.style.opacity = '1', 10);
            setTimeout(() => {
                notif.style.opacity = '0';
                setTimeout(() => notif.remove(), 300);
            }, 4000);
        }

        // Safe postMessage wrapper
        let connectionLost = false;
        function safePost(msg) {
            if (opener && !opener.closed) {
                try {
                    opener.postMessage(msg, '*');
                    return true;
                } catch(e) {
                    if (!connectionLost) {
                        connectionLost = true;
                        showNotification('Mesaj gönderilemedi: ' + e.message, 'error');
                    }
                    return false;
                }
            } else {
                if (!connectionLost) {
                    connectionLost = true;
                    showNotification('Bağlantı koptu! Ana sayfa ile iletişim kurulamıyor.', 'error');
                }
                return false;
            }
        }

        // Heartbeat (Senkronizasyon)
        let lastPong = Date.now();
        let heartbeatInterval = null;

        function startHeartbeat() {
            heartbeatInterval = setInterval(() => {
                if (opener && !opener.closed) {
                    safePost({ type: 'PING' });
                    if (Date.now() - lastPong > 10000 && !connectionLost) {
                        connectionLost = true;
                        showNotification('Bağlantı koptu! Sayfa ile iletişim kurulamıyor.', 'error');
                    }
                } else if (!connectionLost) {
                    connectionLost = true;
                    showNotification('Bağlantı koptu! Ana sayfa kapatılmış olabilir.', 'error');
                }
            }, 3000);
        }

        function requestUsername() {
            if (safePost({ type: 'GET_USERNAME' })) {
                usernameTimeout = setTimeout(() => {
                    if (!usernameReceived) {
                        document.getElementById('username-display').textContent = 'Bağlantı zaman aşımı';
                        document.getElementById('username-display').style.color = 'var(--neon-red)';
                    }
                }, 5000);
            }
        }

        setTimeout(() => {
            requestUsername();
            startHeartbeat();
            safePost({ type: 'GET_TOP_SCORERS' });
        }, 500);

        // Modal Variables
        const modal = document.getElementById('request-modal');
        const modalBody = document.getElementById('modal-details');
        const requestMap = {};
        let currentOpenReqId = null;

        // Modal Functions
        window.closeModal = function() {
            modal.style.display = "none";
            currentOpenReqId = null;
        }

        window.onclick = function(event) {
            if (event.target == modal) closeModal();
        }

        function showModal(id) {
            const req = requestMap[id];
            if (!req) return;
            currentOpenReqId = id;

            const fmt = (obj) => {
                 if (typeof obj !== 'string') return JSON.stringify(obj, null, 2);
                 try { return JSON.stringify(JSON.parse(obj), null, 2); }
                 catch(e) { return obj; }
            };

            let html = '';
            html += '<div class="detail-row"><span class="detail-label">URL</span><span class="detail-val">' + req.url + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Method</span><span class="detail-val">' + req.method + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Status</span><span class="detail-val">' + (req.status || 'Pending...') + '</span></div>';
            html += '<div class="detail-row"><span class="detail-label">Time</span><span class="detail-val">' + new Date(req.timestamp).toLocaleTimeString() + '</span></div>';

            if (req.body) {
                 html += '<div class="detail-row"><span class="detail-label">Payload</span><div class="detail-val">' + fmt(req.body) + '</div></div>';
            }

            if (req.response) {
                 html += '<div class="detail-row"><span class="detail-label">Response</span><div class="detail-val">' + fmt(req.response) + '</div></div>';
            } else if (req.blocked) {
                 html += '<div class="detail-row"><span class="detail-label">Response</span><div class="detail-val" style="color:red">BLOCKED</div></div>';
            }

            modalBody.innerHTML = html;
            modal.style.display = "flex";
        }

        // Elementler
        const els = {
            reqList: document.getElementById('req-list'),
            toggleAuto: document.getElementById('toggle-autosubmit'),
            toggleBlock: document.getElementById('toggle-blocker'),
            inputs: {
                calisma_token: document.getElementById('calisma_token'),
                dogru: document.getElementById('dogru'),
                yanlis: document.getElementById('yanlis'),
                sure: document.getElementById('sure'),
                yarisma_puani: document.getElementById('yarisma_puani'),
                dtv: document.getElementById('dtv'),
                ytv: document.getElementById('ytv'),
                metin: document.getElementById('metin'),
                saniyebilgisi: document.getElementById('saniyebilgisi')
            },
            log: document.getElementById('log-area')
        };

        // Initialize
        if (opener) {
            safePost({ type: 'GET_INIT_STATE' });
        }

        window.addEventListener('message', (e) => {
            const msg = e.data;
            if (!msg) return;

            if (msg.type === 'INIT_STATE') {
                // Listeyi doldur
                msg.state.requests.forEach(r => addRequest(r));

                // Config
                els.toggleBlock.checked = msg.state.isBlocking;
                els.toggleAuto.checked = msg.state.isAutoSubmit;
                updateLock();

                // Builder
                if (msg.state.builderData && msg.state.builderData.calisma_token) {
                    fillForm(msg.state.builderData);
                }
            }
            else if (msg.type === 'NEW_REQUEST') {
                addRequest(msg.request);
            }
            else if (msg.type === 'UPDATE_REQUEST') {
                 const req = requestMap[msg.id];
                 if (req) {
                     req.response = msg.response;
                     req.status = msg.status;

                     // Stop Animation
                     if (req.animEl) {
                         clearInterval(req.animInterval);
                         req.animEl.remove();
                         req.animEl = null;
                     }

                     // Parse Status & Message
                     let durum = 3;
                     let mesaj = "";
                     try {
                         const json = JSON.parse(req.response);
                         if (json.durum !== undefined) {
                             if (json.durum === 'success' || json.durum === 0 || json.durum === '0') durum = 0;
                             else { durum = parseInt(json.durum); if (isNaN(durum)) durum = 3; }
                         }
                         if (json.mesaj && typeof json.mesaj === 'string') mesaj = json.mesaj;
                     } catch(e) {}

                     const isLeaderboardReq = req.body && typeof req.body === 'string' && req.body.includes('hizlilari_getir');

                     // Update UI
                     const li = document.getElementById('req-li-' + req.id);
                     if (li) {
                         let icon = Icons.unknown;
                         let cls = 'status-unknown';

                         if (durum === 0) { icon = Icons.check; cls = 'status-success'; }
                         else if (durum === 1) { icon = Icons.warn; cls = 'status-warn'; }
                         else if (durum >= 2) { icon = Icons.error; cls = 'status-error'; }

                         const statusDiv = document.createElement('div');
                         statusDiv.className = 'req-status ' + cls;
                         if (isLeaderboardReq) {
                             statusDiv.innerHTML = icon + 'Success';
                         } else {
                             statusDiv.innerHTML = icon + (mesaj || ("Status: " + durum));
                         }
                         li.appendChild(statusDiv);

                         if (!isLeaderboardReq && mesaj && mesaj.length > 20) {
                             const msgDiv = document.createElement('div');
                             msgDiv.className = 'req-msg';
                             msgDiv.textContent = mesaj;
                             li.appendChild(msgDiv);
                         }
                     }

                     if (currentOpenReqId === msg.id) showModal(msg.id);
                 }
            }
            else if (msg.type === 'TOP_SCORERS_RESULT') {
                const results = msg.data;
                const container = document.getElementById('leaderboard-content');
                container.innerHTML = "";

                for (const time in results) {
                    const rawData = results[time];

                    let imgSrc = '';
                    let userName = '???';
                    let userScore = '0';
                    let found = false;

                    // 1. Try JSON Parsing
                    try {
                        let data = JSON.parse(rawData);

                        // Handle {durum: "success", mesaj: [...]} format
                        if (data && data.durum === 'success' && Array.isArray(data.mesaj) && data.mesaj.length > 0) {
                            data = data.mesaj;
                        } else if (data && data.mesaj && Array.isArray(data.mesaj)) {
                            data = data.mesaj;
                        }

                        // If array, take first; if object, take it
                        let topUser = null;
                        if (Array.isArray(data) && data.length > 0) topUser = data[0];
                        else if (data && !Array.isArray(data) && data.username) topUser = data;

                        if (topUser) {
                            userName = topUser.username || "Bilinmiyor";
                            userScore = topUser.puan || 0;
                            // Fix relative path if needed
                            if (topUser.profilephoto && !topUser.profilephoto.startsWith('http')) {
                                imgSrc = 'https://katiponline.com/' + topUser.profilephoto;
                            } else {
                                imgSrc = topUser.profilephoto || '';
                            }
                            found = true;
                        }
                    } catch(e) {
                        // Not JSON, fall back to HTML parsing
                    }

                    // 2. Fallback to HTML/Regex Parsing
                    if (!found) {
                        try {
                            const html = rawData;
                            const imgMatch = html.match(/src=["']([^"']+(?:jpg|png|jpeg|gif))["']/i);
                            const userMatch = html.match(/<a[^>]*profile[^>]*>\\s*(.*?)\\s*<\\/a>/i);
                            const scoreMatch = html.match(/(\\d+)\\s*<br>\\s*<small>Doğru/i);

                            if (imgMatch || userMatch) {
                                imgSrc = imgMatch ? imgMatch[1] : '';
                                userName = userMatch ? userMatch[1] : '???';
                                userScore = scoreMatch ? scoreMatch[1] : '0';
                                found = true;
                            }
                        } catch(e) { console.error("Leaderboard Parse Error:", e); }
                    }

                  if (found) {
    const leaderEmojis = ['🦊', '🐱', '🐼', '🦁', '🐯', '🐰', '🐨', '🐸', '🦉', '🐺'];
    const rndEmoji = leaderEmojis[Math.floor(Math.random() * leaderEmojis.length)];
    let avatarHtml;
    if (imgSrc) {
        avatarHtml = '<img src="' + imgSrc + '" class="leader-img" onerror="this.outerHTML=\\'<span class=leader-emoji>' + rndEmoji + '</span>\\'" >';
    } else {
        avatarHtml = '<span class="leader-emoji">' + rndEmoji + '</span>';
    }
    container.innerHTML += '<div class="leader-item">' +
                               avatarHtml +
                               '<div class="leader-info">' +
                                   '<span class="leader-name">' + userName + ' (' + time + ')</span>' +
                                   '<span class="leader-score">' + userScore + ' Puan</span>' +
                               '</div>' +
                           '</div>';
}
                }
            }
            else if (msg.type === 'GAME_STARTED') {
                log("OYUN BAŞLADI: " + msg.token);
                // Refresh triggerla
                safePost({ type: 'MANUAL_REFRESH' });
            }
            else if (msg.type === 'USERNAME_RESULT') {
                usernameReceived = true;
                if (usernameTimeout) clearTimeout(usernameTimeout);
                if (msg.username) {
                    document.getElementById('username-display').textContent = msg.username;
                    document.getElementById('username-display').style.color = 'var(--neon-green)';
                } else {
                    document.getElementById('username-display').textContent = 'Giriş yapılmamış!';
                    document.getElementById('username-display').style.color = 'var(--neon-red)';
                }
            }
            else if (msg.type === 'PONG') {
                lastPong = Date.now();
                if (connectionLost) {
                    connectionLost = false;
                    showNotification('Bağlantı yeniden kuruldu!', 'success');
                }
            }
            else if (msg.type === 'REFRESH_DONE') {
                fillForm(msg.data);
                log("Veriler tazelendi.");
            }
            else if (msg.type === 'FORCE_BLOCKER') {
                els.toggleBlock.checked = msg.value;
                updateLock();
            }
            else if (msg.type === 'LOG') {
                log(msg.message);
            }
        });

        // --- FONKSİYONLAR ---

        function log(txt) {
            els.log.textContent = "> " + txt;
            els.log.style.color = "#fff";
            setTimeout(() => els.log.style.color = "#aaa", 1000);
        }

        function addRequest(req) {
            requestMap[req.id] = req;
            if (req.method !== 'POST' && !req.blocked) return; // Filtrele

            const li = document.createElement('li');
            li.id = 'req-li-' + req.id;
            li.className = 'req-item' + (req.blocked ? ' blocked' : '');
            const time = new Date(req.timestamp).toLocaleTimeString();

            let icon = (req.method === 'POST') ? Icons.upload : Icons.wifi;

            li.innerHTML = \`
                <span class="req-time">[\${time}]</span>
                <div>\${icon} <span class="req-method">\${req.method}</span></div>
                <span class="req-url">\${req.url.split('/').pop()}</span>
            \`;

            // Animation for pending
            if (!req.blocked) {
                const animDiv = document.createElement('div');
                animDiv.style.color = '#aaa';
                animDiv.style.fontSize = '10px';
                animDiv.style.marginTop = '5px';
                animDiv.innerText = '(>_<)';
                li.appendChild(animDiv);

                req.animEl = animDiv;
                let frame = 0;
                const frames = ['(>_<)', '((>_<))', '(((>_<)))', '((>_<))'];
                req.animInterval = setInterval(() => {
                    frame = (frame + 1) % frames.length;
                    animDiv.innerText = frames[frame];
                }, 200);
            } else {
                 const blockDiv = document.createElement('div');
                 blockDiv.className = 'req-status status-error';
                 blockDiv.innerHTML = Icons.error + "BLOCKED";
                 li.appendChild(blockDiv);
            }

            li.onclick = () => {
                showModal(req.id);
            };

            els.reqList.prepend(li);
        }

        function fillForm(data) {
            for (const key in data) {
                const el = document.getElementById(key);
                if (el) el.value = data[key];
            }
            // Auto-Math çalıştır
            calculateStats();
        }

        // --- Logic & Events ---

        function updateLock() {
            if (els.toggleAuto.checked) {
                els.toggleBlock.checked = true;
                els.toggleBlock.disabled = true;
                els.toggleBlock.parentElement.parentElement.style.opacity = "0.7";
            } else {
                els.toggleBlock.disabled = false;
                els.toggleBlock.parentElement.parentElement.style.opacity = "1";
            }
        }

        els.toggleAuto.addEventListener('change', (e) => {
            updateLock();
            safePost({ type: 'UPDATE_CONFIG', key: 'isAutoSubmit', value: e.target.checked });
        });

        els.toggleBlock.addEventListener('change', (e) => {
            safePost({ type: 'UPDATE_CONFIG', key: 'isBlocking', value: e.target.checked });
        });

        document.getElementById('btn-refresh').addEventListener('click', () => {
            safePost({ type: 'MANUAL_REFRESH' });
        });

        document.getElementById('btn-send').addEventListener('click', () => {
            const formData = {};
            document.querySelectorAll('#builder-form input').forEach(inp => {
                formData[inp.id] = inp.value;
            });
            safePost({ type: 'MANUAL_SEND', data: formData });
        });

        document.getElementById('btn-request-token').addEventListener('click', () => {
            safePost({ type: 'REQUEST_NEW_TOKEN' });
        });

        document.getElementById('btn-top-scorers').addEventListener('click', () => {
            safePost({ type: 'GET_TOP_SCORERS' });
        });

        // --- Auto Math & Profil ---

        window.setProfile = (type) => {
            let d = 60, y = 2;
            if (type === 'pro') { d = 110; y = 1; }
            if (type === 'god') { d = 220; y = 0; }

            els.inputs.dogru.value = d;
            els.inputs.yanlis.value = y;
            calculateStats();
        };

        function calculateStats() {
            const dogru = parseInt(els.inputs.dogru.value) || 0;
            const yanlis = parseInt(els.inputs.yanlis.value) || 0;
            const avgWordLen = 6; // Ortalama harf sayısı

            els.inputs.dtv.value = dogru * avgWordLen;
            els.inputs.ytv.value = yanlis * avgWordLen;
            els.inputs.yarisma_puani.value = dogru; // Puan genelde doğru sayısına eşittir

            // Verileri State'e geri gönder
            const formData = {};
            document.querySelectorAll('#builder-form input').forEach(inp => {
                formData[inp.id] = inp.value;
            });
            safePost({ type: 'UPDATE_BUILDER', data: formData });
        }

        els.inputs.dogru.addEventListener('input', calculateStats);
        els.inputs.yanlis.addEventListener('input', calculateStats);

    <\/script>
</body>
</html>
            `);
            doc.close();
        }
    };

    // --- BAŞLATMA ---
    // Sayfa tamamen yüklendiğinde başlat
    if (document.readyState === 'complete') {
        GhostKernel.init();
    } else {
        window.addEventListener('load', () => GhostKernel.init());
    }

})();
