import{p as U,L as _,G as L}from"./assets/audioEngine-CX5Z9DNB.js";console.log("[OiU Content Script] Loaded in Zero-Impact mode.");if(typeof window.__oiuCleanup=="function")try{window.__oiuCleanup()}catch(e){console.warn("[OiU Content Script] Previous instance cleanup error:",e)}chrome.runtime.sendMessage({type:"MEETING_TAB_DETECTED",payload:{url:window.location.href}}).catch(()=>{});let y=!1,E=null;const T=new Map;function M(){try{const e=document.getElementById("oiu-indicator-badge");e&&e.remove()}catch{}}M();const z=["no chat messages yet","loading..","loading...","in-call messages","send a message","messages can only be seen","turn on captions","turn off captions","people","chat","activities","host controls","meeting details","more options","info"];function x(e){const o=e.toLowerCase().trim();return o.length<3?!0:z.some(s=>o===s||o.includes(s))}let N=0,I=0,C=0,A=0,S=!1;document.addEventListener("click",e=>{var i;const o=(i=e.target)==null?void 0:i.closest("button");if(!o)return;const s=(o.getAttribute("aria-label")||o.getAttribute("data-tooltip")||"").toLowerCase();s.includes("caption")&&(o.getAttribute("aria-pressed")==="true"||s.includes("turn off")?(S=!0,console.log("[OiU] User manually clicked to turn OFF captions. Respecting user preference (auto-reopening disabled).")):(S=!1,console.log("[OiU] User manually turned captions ON.")))},!0);function q(){if(!S)try{if(document.querySelector('button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="true"]'))return;const o=document.querySelector('button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="false"]');if(o){o.click(),console.log("[OiU] Automatically turned ON Google Meet captions.");return}const s=Array.from(document.querySelectorAll("button")).find(i=>{const t=(i.getAttribute("aria-label")||i.getAttribute("data-tooltip")||"").toLowerCase();return t.includes("caption")&&!t.includes("off")&&!t.includes("turn off")});s&&s.getAttribute("aria-pressed")!=="true"&&(s.click(),console.log("[OiU] Auto-clicked Meet caption toggle button."))}catch(e){console.warn("[OiU] Safe note in ensureMeetCaptionsOn:",e)}}function k(){if(!S)try{const e=document.querySelector('button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="true"]');if(e){console.log("[OiU Watchdog] Meet captions are ON but stalled. Bouncing caption connection to revive..."),e.click(),setTimeout(()=>{if(!y||S)return;const o=document.querySelector('button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="false"]');o?o.click():e.click(),console.log("[OiU Watchdog] Meet captions reconnected & refreshed successfully.")},250);return}}catch(e){console.warn("[OiU] Error in kickstartMeetCaptions:",e)}}function G(){const e=document.getElementById("oiu-voice-engine-script");if(e)try{e.remove()}catch{}window.postMessage({source:"OIU_CONTENT",action:"STOP"},"*");const o=document.createElement("script");o.id="oiu-voice-engine-script",o.textContent=`
    (function() {
      if (window.__oiuVoiceEngineCleanup) {
        try { window.__oiuVoiceEngineCleanup(); } catch(e) {}
      }
      window.__oiuVoiceEngineActive = true;
      console.log("[OiU Main World] Voice & Audio Engine injected successfully.");

      // 1. Direct Web Speech API listening in Meet's origin
      const SpeechRec = window.webkitSpeechRecognition || window.SpeechRecognition;
      let recognizer = null;

      function startRecognizer() {
        if (!window.__oiuVoiceEngineActive || !SpeechRec) return;
        try {
          if (recognizer) {
            try { recognizer.stop(); } catch(e) {}
          }
          recognizer = new SpeechRec();
          recognizer.continuous = true;
          recognizer.interimResults = true;
          recognizer.lang = "en-IN"; // English (India) & global

          recognizer.onresult = function(event) {
            let finalTranscript = "";
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }
            if (finalTranscript.trim().length > 1) {
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "VOICE_TRANSCRIPT",
                text: finalTranscript.trim()
              }, "*");
            } else if (interimTranscript.trim().split(/\\s+/).length >= 4) {
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "VOICE_TRANSCRIPT",
                text: interimTranscript.trim()
              }, "*");
            }
          };

          recognizer.onerror = function(e) {
            if (e.error !== "no-speech" && e.error !== "aborted") {
              console.log("[OiU Main World] Speech note:", e.error);
            }
          };

          recognizer.onend = function() {
            if (window.__oiuVoiceEngineActive) {
              setTimeout(function() {
                if (window.__oiuVoiceEngineActive) {
                  try { recognizer.start(); } catch(e) {}
                }
              }, 400);
            }
          };

          recognizer.start();
          console.log("[OiU Main World] Web Speech recognizer running in Meet origin.");
        } catch(err) {
          console.log("[OiU Main World] Recognizer init error:", err);
        }
      }

      startRecognizer();

      // 2. Real-time Audio Level Meter (measures live mic volume + remote audio streams)
      let audioCtx = null;
      let analyser = null;
      let animFrameId = null;
      const hookedStreams = new WeakSet();

      function hookRemoteMeetingAudio() {
        if (!audioCtx || !analyser) return;
        try {
          const audioElements = document.querySelectorAll("audio");
          audioElements.forEach(function(el) {
            if (el.srcObject && !hookedStreams.has(el.srcObject)) {
              hookedStreams.add(el.srcObject);
              try {
                const remoteSource = audioCtx.createMediaStreamSource(el.srcObject);
                remoteSource.connect(analyser);
                console.log("[OiU Main World] Connected remote audio stream to volume analyser.");
              } catch(e) {}
            }
          });
        } catch(e) {}
      }

      function startAudioMeter() {
        if (!window.__oiuVoiceEngineActive) return;
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            audioCtx = new AudioCtx();
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            analyser.smoothingTimeConstant = 0.3;
          }

          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
              if (audioCtx && analyser) {
                const source = audioCtx.createMediaStreamSource(stream);
                source.connect(analyser);
              }
            }).catch(function(err) {
              console.log("[OiU Main World] Local mic stream note:", err);
            });
          }

          if (!analyser) return;

          const buffer = new Uint8Array(analyser.frequencyBinCount);
          let lastEmittedLevel = 0;
          let lastEmitTime = 0;
          let lastRemoteScan = 0;

          function pollVolume() {
            if (!window.__oiuVoiceEngineActive) return;
            const now = Date.now();

            // Periodically attach newly joined remote participant audio streams
            if (now - lastRemoteScan > 1500) {
              lastRemoteScan = now;
              hookRemoteMeetingAudio();
            }

            analyser.getByteFrequencyData(buffer);
            let sum = 0;
            for (let i = 0; i < buffer.length; i++) {
              sum += buffer[i];
            }
            const avg = sum / buffer.length;
            const level = Math.min(1.0, Math.round((avg / 128) * 100) / 100);

            if (Math.abs(level - lastEmittedLevel) > 0.04 || (level > 0.05 && now - lastEmitTime > 120)) {
              lastEmittedLevel = level;
              lastEmitTime = now;
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "AUDIO_LEVEL",
                level: level
              }, "*");
            }
            animFrameId = requestAnimationFrame(pollVolume);
          }
          pollVolume();
        } catch(err) {
          console.log("[OiU Main World] Audio meter error:", err);
        }
      }

      startAudioMeter();

      // 3. Cleanup & Stop handler
      window.__oiuVoiceEngineCleanup = function() {
        window.__oiuVoiceEngineActive = false;
        if (recognizer) {
          try { recognizer.stop(); } catch(err) {}
          recognizer = null;
        }
        if (audioCtx) {
          try { audioCtx.close(); } catch(err) {}
          audioCtx = null;
        }
        if (animFrameId) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
      };

      window.addEventListener("message", function(e) {
        if (e.data && e.data.source === "OIU_CONTENT" && e.data.action === "STOP") {
          if (window.__oiuVoiceEngineCleanup) {
            window.__oiuVoiceEngineCleanup();
          }
        }
      });
    })();
  `,(document.head||document.documentElement).appendChild(o)}function P(){window.postMessage({source:"OIU_CONTENT",action:"STOP"},"*");const e=document.getElementById("oiu-voice-engine-script");if(e)try{e.remove()}catch{}}const R=e=>{var o;((o=e.data)==null?void 0:o.source)==="OIU_MAIN_VOICE"&&(e.data.type==="VOICE_TRANSCRIPT"&&e.data.text&&(console.log(`[OiU Live Voice Heard]: "${e.data.text}"`),b(e.data.text,"Live Voice")),e.data.type==="AUDIO_LEVEL"&&typeof e.data.level=="number"&&(e.data.level>.04&&(C=Date.now()),chrome.runtime.sendMessage({type:"AUDIO_LEVEL",payload:{level:e.data.level,packetsCaptured:1}}).catch(()=>{})))};window.addEventListener("message",R);function b(e,o){if(y)try{const s=e.replace(/\s+/g," ").trim();if(!s||s.length<2||x(s))return;I=Date.now();let i=o||"Speaker",t=s;if(s.includes(`
`)){const r=s.split(`
`);r.length>=2&&r[0].length<35&&(i=r[0].trim(),t=r.slice(1).join(" ").trim())}else if(s.includes(":")&&s.indexOf(":")<30){const r=s.split(":");i=r[0].trim(),t=r.slice(1).join(":").trim()}if(!t||t.length<2||x(t))return;const n=Date.now(),c=t.toLowerCase().replace(/[^a-z0-9]/g,""),u=T.get(c);if(u&&n-u<2200)return;if(T.set(c,n),T.size>80)for(const[r,p]of T.entries())n-p>15e3&&T.delete(r);console.log(`[OiU Captions Found] ${i}: "${t}"`);const a={id:`seg_${n}_${Math.random().toString(36).substring(2,6)}`,sessionId:"meet_call",text:t,speakerId:i,startMs:n-1e3,endMs:n,isFinal:!0,confidence:.98};chrome.runtime.sendMessage({type:"TRANSCRIPT_SEGMENT",segment:a}).catch(()=>{})}catch(s){console.warn("[OiU] Error in caption processing (isolated):",s)}}function W(){try{const e=document.querySelectorAll('[jsname="tgaKEf"], span.V67aGc, div.nMxLec, div.VbkSUe, [jsname="r4nke"], div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"], div[jsname="YSfeed"], div[jscontroller="D1tHje"]'),o=Date.now();e.forEach(s=>{var n;const i=s,t=(n=i.textContent)==null?void 0:n.trim();if(t&&t.length>1){i.dataset.oiuLastText=t,i.dataset.oiuSealedLength=String(t.length),i.dataset.oiuLastChangeTime=String(o);const c=t.toLowerCase().replace(/[^a-z0-9]/g,"");c&&T.set(c,o)}}),console.log(`[OiU] Baselined and sealed ${e.length} existing DOM captions so old past speech is not alerted.`)}catch(e){console.warn("[OiU] Error baselining existing captions:",e)}}function B(){if(y)try{let e=document.querySelectorAll('[jsname="tgaKEf"], span.V67aGc, div.nMxLec, div.VbkSUe, [jsname="r4nke"]');e.length===0&&(e=document.querySelectorAll("div.nMxLec, div.VbkSUe"));let o=!1;e.length>0&&e.forEach(s=>{var l,d;if(s.closest('[aria-label*="chat" i], [jsname="xySENc"], [role="log"]'))return;const i=s,t=((l=i.textContent)==null?void 0:l.trim())||"";if(t.length<2)return;if(i.dataset.oiuLastText===t){o=!0;return}const n=Date.now(),c=Number(i.dataset.oiuLastChangeTime||"0");let u=Number(i.dataset.oiuSentenceStartTime||"0"),a=Number(i.dataset.oiuSealedLength||"0");const r=i.dataset.oiuLastText||"";if((u===0||a>=t.length)&&(u=n,i.dataset.oiuSentenceStartTime=String(n)),u>0&&n-u>=7e3&&t.length>a&&(a=r.length,i.dataset.oiuSealedLength=String(a),u=n,i.dataset.oiuSentenceStartTime=String(n)),c>0&&n-c>1800&&t.length>a&&(a=r.length,i.dataset.oiuSealedLength=String(a),u=n,i.dataset.oiuSentenceStartTime=String(n)),a<t.length){const m=t.slice(a),g=m.match(/^([\s\S]*?[.?!])\s+(\S[\s\S]*)$/);g&&g[2]&&g[2].length>=2&&(a+=m.indexOf(g[2]),i.dataset.oiuSealedLength=String(a),u=n,i.dataset.oiuSentenceStartTime=String(n))}if(a<t.length){const g=t.slice(a).match(/^(.{10,}?)\s+(?=(?:what is|what are|what was|what were|what ise|aur what is|aur what ise|and what is|why is|how is|can you)\b)/i);g&&g[1]&&g[1].trim().length>=8&&(a+=g[1].length,i.dataset.oiuSealedLength=String(a),u=n,i.dataset.oiuSentenceStartTime=String(n))}if(t.length-a>120){const m=t.slice(a),g=[];for(let h=0;h<m.length;h++)(m[h]==="?"||m[h]==="."||m[h]==="!")&&g.push(h);if(g.length>=1){const h=g[g.length-1]+1;a+=h,i.dataset.oiuSealedLength=String(a),u=n,i.dataset.oiuSentenceStartTime=String(n)}else if(m.length>160){const h=m.lastIndexOf(" ",m.length-60);h>30&&(a+=h+1,i.dataset.oiuSealedLength=String(a),u=n,i.dataset.oiuSentenceStartTime=String(n))}}i.dataset.oiuLastText=t,i.dataset.oiuLastChangeTime=String(n),o=!0;let p=t;if(a>0&&t.length>a&&(p=t.slice(a).trim()),p.length<2)return;const w=i.closest('div.nMxLec, div.iTTPOb, div[jsname="YSvyfd"], div[jsname="YSfeed"], div[jscontroller="D1tHje"]'),O=w==null?void 0:w.querySelector('.NWkf3b, .jxFHg, .zs7LEd, .bFfZTd, [jsname="W24eoe"], .Kj4Yde, .adEAYb'),f=((d=O==null?void 0:O.textContent)==null?void 0:d.trim())||"Speaker";b(p,f)}),o||document.querySelectorAll('div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"], div[jsname="YSfeed"], div[jscontroller="D1tHje"], div[aria-live="polite"], div[role="region"][aria-label*="caption" i]').forEach(i=>{var O;if(i.closest('[aria-label*="chat" i], [jsname="xySENc"]'))return;const t=i,n=((O=t.textContent)==null?void 0:O.trim())||"";if(n.length<2||t.dataset.oiuLastText===n)return;const c=Date.now(),u=Number(t.dataset.oiuLastChangeTime||"0");let a=Number(t.dataset.oiuSentenceStartTime||"0"),r=Number(t.dataset.oiuSealedLength||"0");const p=t.dataset.oiuLastText||"";if((a===0||r>=n.length)&&(a=c,t.dataset.oiuSentenceStartTime=String(c)),a>0&&c-a>=7e3&&n.length>r&&(r=p.length,t.dataset.oiuSealedLength=String(r),a=c,t.dataset.oiuSentenceStartTime=String(c)),u>0&&c-u>1800&&n.length>r&&(r=p.length,t.dataset.oiuSealedLength=String(r),a=c,t.dataset.oiuSentenceStartTime=String(c)),r<n.length){const f=n.slice(r),l=f.match(/^([\s\S]*?[.?!])\s+(\S[\s\S]*)$/);l&&l[2]&&l[2].length>=2&&(r+=f.indexOf(l[2]),t.dataset.oiuSealedLength=String(r),a=c,t.dataset.oiuSentenceStartTime=String(c))}if(r<n.length){const l=n.slice(r).match(/^(.{10,}?)\s+(?=(?:what is|what are|what was|what were|what ise|aur what is|aur what ise|and what is|why is|how is|can you)\b)/i);l&&l[1]&&l[1].trim().length>=8&&(r+=l[1].length,t.dataset.oiuSealedLength=String(r),a=c,t.dataset.oiuSentenceStartTime=String(c))}if(n.length-r>120){const f=n.slice(r),l=[];for(let d=0;d<f.length;d++)(f[d]==="?"||f[d]==="."||f[d]==="!")&&l.push(d);if(l.length>=1){const d=l[l.length-1]+1;r+=d,t.dataset.oiuSealedLength=String(r),a=c,t.dataset.oiuSentenceStartTime=String(c)}else if(f.length>160){const d=f.lastIndexOf(" ",f.length-60);d>30&&(r+=d+1,t.dataset.oiuSealedLength=String(r),a=c,t.dataset.oiuSentenceStartTime=String(c))}}t.dataset.oiuLastText=n,t.dataset.oiuLastChangeTime=String(c);let w=n;r>0&&n.length>r&&(w=n.slice(r).trim()),!(w.length<2)&&b(w)})}catch(e){console.warn("[OiU] Safe isolated error in scanDOMForCaptions:",e)}}let v=null;function F(){if(!y||S)return;const e=Date.now();e-N>15e3&&C>0&&e-C<1e4&&e-I>15e3&&e-A>35e3&&(console.log("[OiU Watchdog] Sound activity detected but Google Meet captions stalled for >15s. Auto-kickstarting captions..."),A=e,k())}function V(){if(y)return;y=!0,S=!1;const e=Date.now();N=e,I=e,C=0,A=0,M(),chrome.storage.local.get([_,L],o=>{const s=(o==null?void 0:o[_])||"audio_only",i=((o==null?void 0:o[L])||"").trim();if(U.start({groqApiKey:i,onTranscript:t=>{b(t.text,t.speakerId||"Live Meeting Audio")},onAudioLevel:t=>{t>.04&&(C=Date.now()),chrome.runtime.sendMessage({type:"AUDIO_LEVEL",payload:{level:t,packetsCaptured:1}}).catch(()=>{})},onStatusChange:(t,n)=>{console.log(`[OiU Pure Audio Engine] Status: ${t} ${n?`(${n})`:""}`)}}),s==="audio_only"){console.log("[OiU] Running in Pure Audio Mode (Groq Whisper Large V3). Google Meet captions remain completely untouched and OFF.");return}q(),W(),G(),E&&clearInterval(E),E=setInterval(B,600),v&&clearInterval(v),v=setInterval(F,5e3),console.log("[OiU] Dual mode active (Audio Engine + Captions companion).")})}function j(){y=!1,S=!1;try{U.stop()}catch(e){console.warn("[OiU] Error stopping pure audio engine:",e)}E&&(clearInterval(E),E=null),v&&(clearInterval(v),v=null),P(),M(),T.clear(),console.log("[OiU] Monitoring stopped.")}const D=(e,o,s)=>{if((e==null?void 0:e.type)==="START_MEET_MONITORING")return V(),s({success:!0,monitoring:!0}),!1;if((e==null?void 0:e.type)==="KICKSTART_MEET_CAPTIONS"||(e==null?void 0:e.type)==="TOGGLE_MEET_CAPTIONS")return k(),s({success:!0}),!1;if((e==null?void 0:e.type)==="STOP_MEET_MONITORING")return j(),s({success:!0,monitoring:!1}),!1};chrome.runtime.onMessage.addListener(D);window.__oiuCleanup=()=>{j();try{chrome.runtime.onMessage.removeListener(D)}catch{}try{window.removeEventListener("message",R)}catch{}};chrome.runtime.sendMessage({type:"GET_SESSION_STATE"},e=>{var o;chrome.runtime.lastError||((o=e==null?void 0:e.session)==null?void 0:o.state)==="LISTENING"&&(console.log("[OiU Content Script] Background session is in LISTENING state, auto-starting monitoring."),V())});
