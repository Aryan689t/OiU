console.log("[OiU Content Script] Loaded in Zero-Impact mode.");chrome.runtime.sendMessage({type:"MEETING_TAB_DETECTED",payload:{url:window.location.href}}).catch(()=>{});let g=!1,u=null;const s=new Map;function p(){try{const e=document.getElementById("oiu-indicator-badge");e&&e.remove()}catch{}}p();const w=["no chat messages yet","loading..","loading...","in-call messages","send a message","messages can only be seen","turn on captions","turn off captions","people","chat","activities","host controls","meeting details","more options","info"];function v(e){const t=e.toLowerCase().trim();return t.length<3?!0:w.some(n=>t===n||t.includes(n))}function E(){try{if(document.querySelector('button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i]'))return;const t=document.querySelector('button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i]');t&&(t.click(),console.log("[OiU] Turned ON Google Meet captions."))}catch(e){console.warn("[OiU] Safe note in ensureMeetCaptionsOn:",e)}}function y(){if(document.getElementById("oiu-voice-engine-script"))return;const t=document.createElement("script");t.id="oiu-voice-engine-script",t.textContent=`
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
  `,(document.head||document.documentElement).appendChild(t)}function O(){window.postMessage({source:"OIU_CONTENT",action:"STOP"},"*");const e=document.getElementById("oiu-voice-engine-script");if(e)try{e.remove()}catch{}}window.addEventListener("message",e=>{var t;((t=e.data)==null?void 0:t.source)==="OIU_MAIN_VOICE"&&(e.data.type==="VOICE_TRANSCRIPT"&&e.data.text&&(console.log(`[OiU Live Voice Heard]: "${e.data.text}"`),m(e.data.text,"Live Voice")),e.data.type==="AUDIO_LEVEL"&&typeof e.data.level=="number"&&chrome.runtime.sendMessage({type:"AUDIO_LEVEL",payload:{level:e.data.level,packetsCaptured:1}}).catch(()=>{}))});function m(e,t){if(g)try{const n=e.replace(/\s+/g," ").trim();if(!n||n.length<2||v(n))return;let r=t||"Speaker",i=n;if(n.includes(`
`)){const c=n.split(`
`);c.length>=2&&c[0].length<35&&(r=c[0].trim(),i=c.slice(1).join(" ").trim())}else if(n.includes(":")&&n.indexOf(":")<30){const c=n.split(":");r=c[0].trim(),i=c.slice(1).join(":").trim()}if(!i||i.length<2||v(i))return;const o=Date.now(),a=i.toLowerCase().replace(/[^a-z0-9]/g,""),l=s.get(a);if(l&&o-l<700)return;if(s.set(a,o),s.size>80)for(const[c,h]of s.entries())o-h>15e3&&s.delete(c);console.log(`[OiU Captions Found] ${r}: "${i}"`);const f={id:`seg_${o}_${Math.random().toString(36).substring(2,6)}`,sessionId:"meet_call",text:i,speakerId:r,startMs:o-1e3,endMs:o,isFinal:!0,confidence:.98};chrome.runtime.sendMessage({type:"TRANSCRIPT_SEGMENT",segment:f}).catch(()=>{})}catch(n){console.warn("[OiU] Error in caption processing (isolated):",n)}}function M(){try{const e=document.querySelectorAll('[jsname="tgaKEf"], div.nMxLec, div.VbkSUe, div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]'),t=Date.now();e.forEach(n=>{var o;const r=n,i=(o=r.textContent)==null?void 0:o.trim();if(i&&i.length>1){r.dataset.oiuLastText=i;const a=i.toLowerCase().replace(/[^a-z0-9]/g,"");a&&s.set(a,t)}}),console.log(`[OiU] Baselined ${e.length} existing DOM captions so old past speech is not alerted.`)}catch(e){console.warn("[OiU] Error baselining existing captions:",e)}}function T(){if(g)try{let e=document.querySelectorAll('[jsname="tgaKEf"]');e.length===0&&(e=document.querySelectorAll("div.nMxLec, div.VbkSUe"));let t=!1;e.length>0&&e.forEach(n=>{var o,a;if(n.closest('[aria-label*="chat" i], [jsname="xySENc"], [role="log"]'))return;const r=n,i=(o=r.textContent)==null?void 0:o.trim();if(i&&i.length>1){if(r.dataset.oiuLastText===i){t=!0;return}r.dataset.oiuLastText=i,t=!0;const l=r.closest('div.nMxLec, div.iTTPOb, div[jsname="YSvyfd"]'),f=l==null?void 0:l.querySelector(".NWkf3b, .jxFHg, .zs7LEd, .bFfZTd"),c=((a=f==null?void 0:f.textContent)==null?void 0:a.trim())||"Speaker";m(i,c)}}),t||document.querySelectorAll('div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]').forEach(r=>{var a;if(r.closest('[aria-label*="chat" i], [jsname="xySENc"]'))return;const i=r,o=(a=i.textContent)==null?void 0:a.trim();if(o&&o.length>2){if(i.dataset.oiuLastText===o)return;i.dataset.oiuLastText=o,m(o)}})}catch(e){console.warn("[OiU] Safe isolated error in scanDOMForCaptions:",e)}}let d=null;function I(){g||(g=!0,p(),E(),M(),y(),u&&clearInterval(u),u=setInterval(T,600),d&&clearInterval(d),d=setInterval(E,5e3),console.log("[OiU] Dual-Engine monitoring active (Voice Engine + Captions Engine)."))}function x(){g=!1,u&&(clearInterval(u),u=null),d&&(clearInterval(d),d=null),O(),p(),s.clear(),console.log("[OiU] Monitoring stopped.")}chrome.runtime.onMessage.addListener((e,t,n)=>{if((e==null?void 0:e.type)==="START_MEET_MONITORING")return I(),n({success:!0,monitoring:!0}),!1;if((e==null?void 0:e.type)==="STOP_MEET_MONITORING")return x(),n({success:!0,monitoring:!1}),!1});
