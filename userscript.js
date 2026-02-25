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
                let reqId = null;

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

                if (!isBypass) {
                    reqId = self.logRequest('XHR', this._method, url, body, false);
                }

                // Response Hooking for XHR
                if (reqId) {
                    this.addEventListener('load', function() {
                        self.updateRequestLog(reqId, {
                            response: this.responseText,
                            status: this.status
                        });
                    });
                    this.addEventListener('error', function() {
                        self.updateRequestLog(reqId, {
                            response: "NETWORK_ERROR",
                            status: 0
                        });
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
                let reqId = null;

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

                if (!isBypass) {
                    reqId = self.logRequest('FETCH', method, url, body, false);
                }

                try {
                    const response = await originalFetch.apply(this, arguments);

                    if (url.includes('islemler.php')) {
                        const cloneForStart = response.clone();
                        cloneForStart.text().then(text => self.processStartResponse(text));
                    }

                    if (reqId) {
                        const cloneForLog = response.clone();
                        cloneForLog.text().then(text => {
                            self.updateRequestLog(reqId, {
                                response: text,
                                status: response.status
                            });
                        }).catch(err => {
                            self.updateRequestLog(reqId, { response: "Error reading response: " + err });
                        });
                    }

                    return response;
                } catch (err) {
                    if (reqId) {
                         self.updateRequestLog(reqId, { response: "FETCH_ERROR: " + err });
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

        updateRequestLog: function(id, data) {
            const req = this.state.requests.find(r => r.id === id);
            if (req) {
                Object.assign(req, data);
                this.broadcast({
                    type: 'UPDATE_REQUEST_LOG',
                    id: id,
                    data: data
                });
            }
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

            window.fetch('https://katiponline.com/klavye-hiz-testi/sonuckaydet.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Bypass-Interceptor': 'true'
                },
                body: params.toString()
            }).then(res => res.text()).then(text => {
                console.log("GhostKernel: Auto-Submit BAŞARILI!", text);
                this.broadcast({ type: 'LOG', message: "OTO-GÖNDER BAŞARILI!" });
            }).catch(err => {
                console.error("GhostKernel: Auto-Submit HATASI", err);
                this.broadcast({ type: 'LOG', message: "OTO-GÖNDER HATASI!" });
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

        // Helper: Yeni Çalışma Tokeni İste
        fetchNewToken: function() {
            console.log("GhostKernel: Yeni token isteniyor...");
            // Bu istek Interceptor tarafından yakalanacak ve loglanacaktır.
            // Bypass header'ı göndermiyoruz.
            window.fetch('https://katiponline.com/klavye-hiz-testi/islemler.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                },
                body: 'islem=calisma_baslat'
            }).then(res => res.text())
              .then(text => {
                  console.log("GhostKernel: Token isteği tamamlandı.");
                  // Interceptor zaten processStartResponse'u çağırmış olmalı (url check nedeniyle)
                  // Ancak processStartResponse XHR/fetch clone üzerinden çağrılıyor.
                  // Burada ayrıca işlem yapmamıza gerek yok, interceptor hallediyor.
              })
              .catch(err => {
                  console.error("GhostKernel: Token isteği hatası", err);
              });
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
                case 'GET_TOKEN':
                    // Token iste
                    this.fetchNewToken();
                    break;
            }
        },

        injectTriggerButton: function() {
            const btn = document.createElement('button');
            btn.textContent = 'KatiPwn';
            btn.style.cssText = `
                position: fixed; bottom: 20px; left: 20px; z-index: 99999;
                padding: 10px 20px; background: rgba(0,0,0,0.8); color: #00ff41;
                border: 1px solid #00ff41; font-family: monospace; cursor: pointer;
                box-shadow: 0 0 10px #00ff41; backdrop-filter: blur(5px);
                transition: all 0.3s;
            `;
            btn.onmouseover = () => btn.style.boxShadow = "0 0 20px #00ff41";
            btn.onmouseout = () => btn.style.boxShadow = "0 0 10px #00ff41";

            btn.onclick = () => {
                const win = window.open('', 'kht_ghost_panel', 'width=900,height=800');
                if (win) {
                    UIManager.render(win);
                    this.popupWindow = win;
                } else {
                    alert("Lütfen popup izni verin!");
                }
            };
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

        /* MODAL */
        .modal {
            display: none; position: fixed; z-index: 10000; left: 0; top: 0; width: 100%; height: 100%;
            overflow: auto; background-color: rgba(0,0,0,0.8); backdrop-filter: blur(5px);
        }
        .modal-content {
            background-color: #111; margin: 5% auto; padding: 20px; border: 1px solid var(--neon-green);
            width: 80%; max-width: 800px; color: var(--text); position: relative;
            box-shadow: 0 0 20px rgba(0, 255, 65, 0.2); border-radius: 8px;
        }
        .close-modal {
            color: #aaa; float: right; font-size: 28px; font-weight: bold; cursor: pointer;
        }
        .close-modal:hover, .close-modal:focus { color: var(--neon-green); text-decoration: none; cursor: pointer; }
        #modal-body {
            white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 12px;
            max-height: 60vh; overflow-y: auto; color: #ddd;
        }
        .json-key { color: var(--neon-pink); }
        .json-val { color: var(--neon-green); }
        .json-str { color: #f0f080; }

    </style>
</head>
<body>
    <div class="app-container">
        <!-- SIDEBAR -->
        <div class="sidebar">
            <div class="sidebar-header">AĞ İZLEME GEÇMİŞİ</div>
            <ul id="req-list">
                <!-- İstekler buraya gelecek -->
            </ul>
        </div>

        <!-- MAIN -->
        <div class="main">

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
                            <button id="btn-get-token" class="cyber-btn" style="margin:0; padding: 5px 10px; font-size: 10px;">TOKEN AL</button>
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
                        <label>Süre (mm:ss / sn)</label>
                        <div style="display: flex; gap: 5px;">
                            <input type="text" id="sure" value="01:00" placeholder="mm:ss" style="flex: 2;">
                            <input type="number" id="sure_sn" value="60" placeholder="sn" style="flex: 1;">
                        </div>
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
                    <input type="hidden" id="saniyebilgisi" value="60">
                    <input type="hidden" id="metingrububilgisi" value="">
                    <input type="hidden" id="baslik" value="">
                    <input type="hidden" id="imla" value="">
                </div>

                <button class="cyber-btn" id="btn-send" style="width: 100%;">BU VERİLERLE GÖNDER</button>
                <div id="log-area">Sistem Hazır.</div>
            </div>

        </div>

        <!-- DETAIL MODAL -->
        <div id="detail-modal" class="modal">
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h3 id="modal-title">REQUEST DETAILS</h3>
                <div id="modal-body"></div>
            </div>
        </div>
    </div>

    <script>
        // --- İLETİŞİM KATMANI ---
        const opener = window.opener;

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
                sure_sn: document.getElementById('sure_sn'),
                yarisma_puani: document.getElementById('yarisma_puani'),
                dtv: document.getElementById('dtv'),
                ytv: document.getElementById('ytv'),
                metin: document.getElementById('metin'),
                saniyebilgisi: document.getElementById('saniyebilgisi')
            },
            log: document.getElementById('log-area'),
            modal: {
                el: document.getElementById('detail-modal'),
                content: document.getElementById('modal-body'),
                close: document.querySelector('.close-modal')
            },
            btnGetToken: document.getElementById('btn-get-token')
        };

        const requestsMap = new Map();
        let currentModalReqId = null;

        // Initialize
        if (opener) {
            opener.postMessage({ type: 'GET_INIT_STATE' }, '*');
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
            else if (msg.type === 'UPDATE_REQUEST_LOG') {
                const req = requestsMap.get(msg.id);
                if (req) {
                    Object.assign(req, msg.data);
                    // Eğer modal açıksa ve bu isteği gösteriyorsa güncelle
                    if (currentModalReqId === msg.id) {
                        renderModalContent(req);
                    }
                }
            }
            else if (msg.type === 'GAME_STARTED') {
                log("OYUN BAŞLADI: " + msg.token);
                // Refresh triggerla
                opener.postMessage({ type: 'MANUAL_REFRESH' }, '*');
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
            if (req.method !== 'POST' && !req.blocked) return; // Filtrele

            // Store in Map
            requestsMap.set(req.id, req);

            const li = document.createElement('li');
            li.className = 'req-item' + (req.blocked ? ' blocked' : '');
            const time = new Date(req.timestamp).toLocaleTimeString();

            li.innerHTML = \`
                <span class="req-time">[\${time}]</span>
                <span class="req-method">\${req.method}</span>
                <span class="req-url">\${req.url.split('/').pop()}</span>
            \`;

            li.onclick = () => {
                openModal(req.id);
            };

            els.reqList.prepend(li);
        }

        // --- MODAL LOGIC ---
        function openModal(reqId) {
            const req = requestsMap.get(reqId);
            if (!req) return;

            currentModalReqId = reqId;
            renderModalContent(req);
            els.modal.el.style.display = "block";
        }

        function closeModal() {
            els.modal.el.style.display = "none";
            currentModalReqId = null;
        }

        function renderModalContent(req) {
            let html = \`<div><strong>URL:</strong> \${req.url}</div>\`;
            html += \`<div><strong>Method:</strong> \${req.method}</div>\`;
            html += \`<div><strong>Time:</strong> \${new Date(req.timestamp).toLocaleString()}</div>\`;
            html += \`<div><strong>Status:</strong> \${req.blocked ? '<span style="color:var(--neon-red)">BLOCKED</span>' : (req.status || 'PENDING')}</div>\`;

            html += \`<div style="margin-top:10px; border-top:1px solid #333; padding-top:5px; color:var(--neon-green)">PAYLOAD:</div>\`;
            html += \`<pre>\${formatBody(req.body)}</pre>\`;

            if (req.response) {
                html += \`<div style="margin-top:10px; border-top:1px solid #333; padding-top:5px; color:var(--neon-pink)">RESPONSE:</div>\`;
                html += \`<pre>\${formatBody(req.response)}</pre>\`;
            }

            els.modal.content.innerHTML = html;
        }

        function formatBody(body) {
            if (!body) return "Wait...";
            try {
                if (typeof body === 'object') return syntaxHighlight(body);
                // Try parse URL encoded
                if (body.includes('=') && !body.includes('{')) {
                    const params = new URLSearchParams(body);
                    const obj = {};
                    for(const [k,v] of params.entries()) obj[k] = v;
                    return syntaxHighlight(obj);
                }
                // Try parse JSON string
                const json = JSON.parse(body);
                return syntaxHighlight(json);
            } catch (e) {
                return escapeHtml(body);
            }
        }

        function escapeHtml(text) {
             if (typeof text !== 'string') return text;
             return text.replace(/&/g, "&amp;")
                        .replace(/</g, "&lt;")
                        .replace(/>/g, "&gt;")
                        .replace(/"/g, "&quot;")
                        .replace(/'/g, "&#039;");
        }

        function syntaxHighlight(json) {
            if (typeof json != 'string') {
                 json = JSON.stringify(json, undefined, 2);
            }
            json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
                var cls = 'json-val'; // number
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        cls = 'json-key';
                    } else {
                        cls = 'json-str';
                    }
                } else if (/true|false/.test(match)) {
                    cls = 'json-val'; // boolean
                } else if (/null/.test(match)) {
                    cls = 'json-val'; // null
                }
                return '<span class="' + cls + '">' + match + '</span>';
            });
        }

        // Close Modal Events
        els.modal.close.onclick = closeModal;
        window.onclick = function(event) {
            if (event.target == els.modal.el) {
                closeModal();
            }
        };


        function fillForm(data) {
            for (const key in data) {
                const el = document.getElementById(key);
                if (el) el.value = data[key];
            }
            // Sync sure_sn
            if (data.saniyebilgisi && els.inputs.sure_sn) {
                els.inputs.sure_sn.value = data.saniyebilgisi;
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
            opener.postMessage({ type: 'UPDATE_CONFIG', key: 'isAutoSubmit', value: e.target.checked }, '*');
        });

        els.toggleBlock.addEventListener('change', (e) => {
            opener.postMessage({ type: 'UPDATE_CONFIG', key: 'isBlocking', value: e.target.checked }, '*');
        });

        document.getElementById('btn-refresh').addEventListener('click', () => {
            opener.postMessage({ type: 'MANUAL_REFRESH' }, '*');
        });

        document.getElementById('btn-send').addEventListener('click', () => {
            const formData = {};
            document.querySelectorAll('#builder-form input').forEach(inp => {
                if (inp.id !== 'sure_sn') { // sure_sn'i gönderme, sure zaten var
                    formData[inp.id] = inp.value;
                }
            });
            opener.postMessage({ type: 'MANUAL_SEND', data: formData }, '*');
        });

        // Token Button
        els.btnGetToken.addEventListener('click', () => {
             opener.postMessage({ type: 'GET_TOKEN' }, '*');
        });

        // Duration Sync
        els.inputs.sure.addEventListener('input', (e) => {
            // mm:ss -> seconds
            const val = e.target.value;
            if (val.includes(':')) {
                const parts = val.split(':');
                const m = parseInt(parts[0]) || 0;
                const s = parseInt(parts[1]) || 0;
                els.inputs.sure_sn.value = (m * 60) + s;
                els.inputs.saniyebilgisi.value = els.inputs.sure_sn.value;
            }
        });

        els.inputs.sure_sn.addEventListener('input', (e) => {
            // seconds -> mm:ss
            const sec = parseInt(e.target.value) || 0;
            const m = Math.floor(sec / 60).toString().padStart(2, '0');
            const s = (sec % 60).toString().padStart(2, '0');
            els.inputs.sure.value = `${m}:${s}`;
            els.inputs.saniyebilgisi.value = sec;
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
            opener.postMessage({ type: 'UPDATE_BUILDER', data: formData }, '*');
        }

        els.inputs.dogru.addEventListener('input', calculateStats);
        els.inputs.yanlis.addEventListener('input', calculateStats);

    </script>
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
