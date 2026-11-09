console.log("[OiU Content Script] Loaded in Zero-Impact mode.");if(window.__oiuContentScriptActive)console.log("[OiU Content Script] Already active in this tab, skipping duplicate initialization.");else{let y=function(){try{const e=document.getElementById("oiu-indicator-badge");e&&e.remove()}catch{}},x=function(e){const o=e.toLowerCase().trim();return o.length<3?!0:U.some(n=>o===n||o.includes(n))},C=function(){try{if(document.querySelector('button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="true"]'))return;const o=document.querySelector('button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="false"]');if(o){o.click(),console.log("[OiU] Automatically turned ON Google Meet captions.");return}const n=Array.from(document.querySelectorAll("button")).find(i=>{const t=(i.getAttribute("aria-label")||i.getAttribute("data-tooltip")||"").toLowerCase();return t.includes("caption")&&!t.includes("off")&&!t.includes("turn off")});n&&n.getAttribute("aria-pressed")!=="true"&&(n.click(),console.log("[OiU] Auto-clicked Meet caption toggle button."))}catch(e){console.warn("[OiU] Safe note in ensureMeetCaptionsOn:",e)}},I=function(){if(document.getElementById("oiu-voice-engine-script"))return;const o=document.createElement("script");o.id="oiu-voice-engine-script",o.textContent=`
    (function() {
      if (window.__oiuVoiceEngineActive) return;
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
            const text = (finalTranscript || interimTranscript).trim();
            if (text && text.length > 2) {
              window.postMessage({
                source: "OIU_MAIN_VOICE",
                type: "VOICE_TRANSCRIPT",
                text: text
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

      // 2. Real-time Audio Level Meter (measures live mic volume)
      let audioCtx = null;
      let analyser = null;
      let animFrameId = null;

      function startAudioMeter() {
        if (!window.__oiuVoiceEngineActive) return;
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
              const AudioCtx = window.AudioContext || window.webkitAudioContext;
              if (!AudioCtx) return;
              audioCtx = new AudioCtx();
              const source = audioCtx.createMediaStreamSource(stream);
              analyser = audioCtx.createAnalyser();
              analyser.fftSize = 64;
              analyser.smoothingTimeConstant = 0.3;
              source.connect(analyser);

              const buffer = new Uint8Array(analyser.frequencyBinCount);
              let lastEmittedLevel = 0;
              let lastEmitTime = 0;

              function pollVolume() {
                if (!window.__oiuVoiceEngineActive) return;
                analyser.getByteFrequencyData(buffer);
                let sum = 0;
                for (let i = 0; i < buffer.length; i++) {
                  sum += buffer[i];
                }
                const avg = sum / buffer.length;
                const level = Math.min(1.0, Math.round((avg / 128) * 100) / 100);
                const now = Date.now();

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
            }).catch(function(err) {
              console.log("[OiU Main World] Audio stream note:", err);
            });
          }
        } catch(err) {
          console.log("[OiU Main World] Audio meter error:", err);
        }
      }

      startAudioMeter();

      // 3. Stop listener
      window.addEventListener("message", function(e) {
        if (e.data && e.data.source === "OIU_CONTENT" && e.data.action === "STOP") {
          window.__oiuVoiceEngineActive = false;
          if (recognizer) {
            try { recognizer.stop(); } catch(err) {}
          }
          if (audioCtx) {
            try { audioCtx.close(); } catch(err) {}
          }
          if (animFrameId) {
            cancelAnimationFrame(animFrameId);
          }
        }
      });
    })();
  `,(document.head||document.documentElement).appendChild(o)},A=function(){window.postMessage({source:"OIU_CONTENT",action:"STOP"},"*");const e=document.getElementById("oiu-voice-engine-script");if(e)try{e.remove()}catch{}},O=function(e,o){if(E)try{const n=e.replace(/\s+/g," ").trim();if(!n||n.length<2||x(n))return;let i=o||"Speaker",t=n;if(n.includes(`
`)){const c=n.split(`
`);c.length>=2&&c[0].length<35&&(i=c[0].trim(),t=c.slice(1).join(" ").trim())}else if(n.includes(":")&&n.indexOf(":")<30){const c=n.split(":");i=c[0].trim(),t=c.slice(1).join(":").trim()}if(!t||t.length<2||x(t))return;const r=Date.now(),u=t.toLowerCase().replace(/[^a-z0-9]/g,""),a=m.get(u);if(a&&r-a<2200)return;if(m.set(u,r),m.size>80)for(const[c,g]of m.entries())r-g>15e3&&m.delete(c);console.log(`[OiU Captions Found] ${i}: "${t}"`);const s={id:`seg_${r}_${Math.random().toString(36).substring(2,6)}`,sessionId:"meet_call",text:t,speakerId:i,startMs:r-1e3,endMs:r,isFinal:!0,confidence:.98};chrome.runtime.sendMessage({type:"TRANSCRIPT_SEGMENT",segment:s}).catch(()=>{})}catch(n){console.warn("[OiU] Error in caption processing (isolated):",n)}},M=function(){try{const e=document.querySelectorAll('[jsname="tgaKEf"], div.nMxLec, div.VbkSUe, div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]'),o=Date.now();e.forEach(n=>{var r;const i=n,t=(r=i.textContent)==null?void 0:r.trim();if(t&&t.length>1){i.dataset.oiuLastText=t,i.dataset.oiuSealedLength=String(t.length),i.dataset.oiuLastChangeTime=String(o);const u=t.toLowerCase().replace(/[^a-z0-9]/g,"");u&&m.set(u,o)}}),console.log(`[OiU] Baselined and sealed ${e.length} existing DOM captions so old past speech is not alerted.`)}catch(e){console.warn("[OiU] Error baselining existing captions:",e)}},b=function(){if(E)try{let e=document.querySelectorAll('[jsname="tgaKEf"]');e.length===0&&(e=document.querySelectorAll("div.nMxLec, div.VbkSUe"));let o=!1;e.length>0&&e.forEach(n=>{var p,l;if(n.closest('[aria-label*="chat" i], [jsname="xySENc"], [role="log"]'))return;const i=n,t=((p=i.textContent)==null?void 0:p.trim())||"";if(t.length<2)return;if(i.dataset.oiuLastText===t){o=!0;return}const r=Date.now(),u=Number(i.dataset.oiuLastChangeTime||"0");let a=Number(i.dataset.oiuSealedLength||"0");const s=i.dataset.oiuLastText||"";if(u>0&&r-u>1800&&t.length>a&&(a=s.length,i.dataset.oiuSealedLength=String(a)),t.length-a>120){const h=t.slice(a),T=[];for(let d=0;d<h.length;d++)(h[d]==="?"||h[d]==="."||h[d]==="!")&&T.push(d);if(T.length>=1){const d=T[T.length-1]+1;a+=d,i.dataset.oiuSealedLength=String(a)}else if(h.length>180){const d=h.lastIndexOf(" ",h.length-80);d>40&&(a+=d+1,i.dataset.oiuSealedLength=String(a))}}i.dataset.oiuLastText=t,i.dataset.oiuLastChangeTime=String(r),o=!0;let c=t;if(a>0&&t.length>a&&(c=t.slice(a).trim()),c.length<2)return;const g=i.closest('div.nMxLec, div.iTTPOb, div[jsname="YSvyfd"]'),w=g==null?void 0:g.querySelector(".NWkf3b, .jxFHg, .zs7LEd, .bFfZTd"),f=((l=w==null?void 0:w.textContent)==null?void 0:l.trim())||"Speaker";O(c,f)}),o||document.querySelectorAll('div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]').forEach(i=>{var w;if(i.closest('[aria-label*="chat" i], [jsname="xySENc"]'))return;const t=i,r=((w=t.textContent)==null?void 0:w.trim())||"";if(r.length<2||t.dataset.oiuLastText===r)return;const u=Date.now(),a=Number(t.dataset.oiuLastChangeTime||"0");let s=Number(t.dataset.oiuSealedLength||"0");const c=t.dataset.oiuLastText||"";if(a>0&&u-a>1800&&r.length>s&&(s=c.length,t.dataset.oiuSealedLength=String(s)),r.length-s>120){const f=r.slice(s),p=[];for(let l=0;l<f.length;l++)(f[l]==="?"||f[l]==="."||f[l]==="!")&&p.push(l);if(p.length>=1){const l=p[p.length-1]+1;s+=l,t.dataset.oiuSealedLength=String(s)}else if(f.length>180){const l=f.lastIndexOf(" ",f.length-80);l>40&&(s+=l+1,t.dataset.oiuSealedLength=String(s))}}t.dataset.oiuLastText=r,t.dataset.oiuLastChangeTime=String(u);let g=r;s>0&&r.length>s&&(g=r.slice(s).trim()),!(g.length<2)&&O(g)})}catch(e){console.warn("[OiU] Safe isolated error in scanDOMForCaptions:",e)}},L=function(){E||(E=!0,y(),C(),M(),I(),v&&clearInterval(v),v=setInterval(b,600),S&&clearInterval(S),S=setInterval(C,5e3),console.log("[OiU] Dual-Engine monitoring active (Voice Engine + Captions Engine)."))},_=function(){E=!1,v&&(clearInterval(v),v=null),S&&(clearInterval(S),S=null),A(),y(),m.clear(),console.log("[OiU] Monitoring stopped.")};window.__oiuContentScriptActive=!0,chrome.runtime.sendMessage({type:"MEETING_TAB_DETECTED",payload:{url:window.location.href}}).catch(()=>{});let E=!1,v=null;const m=new Map;y();const U=["no chat messages yet","loading..","loading...","in-call messages","send a message","messages can only be seen","turn on captions","turn off captions","people","chat","activities","host controls","meeting details","more options","info"];window.addEventListener("message",e=>{var o;((o=e.data)==null?void 0:o.source)==="OIU_MAIN_VOICE"&&(e.data.type==="VOICE_TRANSCRIPT"&&e.data.text&&(console.log(`[OiU Live Voice Heard]: "${e.data.text}"`),O(e.data.text,"Live Voice")),e.data.type==="AUDIO_LEVEL"&&typeof e.data.level=="number"&&chrome.runtime.sendMessage({type:"AUDIO_LEVEL",payload:{level:e.data.level,packetsCaptured:1}}).catch(()=>{}))});let S=null;chrome.runtime.onMessage.addListener((e,o,n)=>{if((e==null?void 0:e.type)==="START_MEET_MONITORING")return L(),n({success:!0,monitoring:!0}),!1;if((e==null?void 0:e.type)==="TOGGLE_MEET_CAPTIONS")return C(),n({success:!0}),!1;if((e==null?void 0:e.type)==="STOP_MEET_MONITORING")return _(),n({success:!0,monitoring:!1}),!1})}
