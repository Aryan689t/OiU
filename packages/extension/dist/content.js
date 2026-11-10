console.log("[OiU Content Script] Loaded in Zero-Impact mode.");if(window.__oiuContentScriptActive)console.log("[OiU Content Script] Already active in this tab, skipping duplicate initialization.");else{let E=function(){try{const e=document.getElementById("oiu-indicator-badge");e&&e.remove()}catch{}},I=function(e){const o=e.toLowerCase().trim();return o.length<3?!0:D.some(n=>o===n||o.includes(n))},C=function(){try{if(document.querySelector('button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="true"]'))return;const o=document.querySelector('button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="false"]');if(o){o.click(),console.log("[OiU] Automatically turned ON Google Meet captions.");return}const n=Array.from(document.querySelectorAll("button")).find(i=>{const t=(i.getAttribute("aria-label")||i.getAttribute("data-tooltip")||"").toLowerCase();return t.includes("caption")&&!t.includes("off")&&!t.includes("turn off")});n&&n.getAttribute("aria-pressed")!=="true"&&(n.click(),console.log("[OiU] Auto-clicked Meet caption toggle button."))}catch(e){console.warn("[OiU] Safe note in ensureMeetCaptionsOn:",e)}},x=function(){try{const e=document.querySelector('button[aria-label*="turn off captions" i], button[data-tooltip*="turn off captions" i], button[aria-pressed="true"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="true"]');if(e){console.log("[OiU Watchdog] Meet captions are ON but stalled. Bouncing caption connection to revive..."),e.click(),setTimeout(()=>{const o=document.querySelector('button[aria-label*="turn on captions" i], button[data-tooltip*="turn on captions" i], button[aria-pressed="false"][aria-label*="caption" i], button[jsname="r8qRAd"][aria-pressed="false"]');o?o.click():e.click(),console.log("[OiU Watchdog] Meet captions reconnected & refreshed successfully.")},250);return}C()}catch(e){console.warn("[OiU] Error in kickstartMeetCaptions:",e)}},L=function(){if(document.getElementById("oiu-voice-engine-script"))return;const o=document.createElement("script");o.id="oiu-voice-engine-script",o.textContent=`
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
  `,(document.head||document.documentElement).appendChild(o)},U=function(){window.postMessage({source:"OIU_CONTENT",action:"STOP"},"*");const e=document.getElementById("oiu-voice-engine-script");if(e)try{e.remove()}catch{}},b=function(e,o){if(y)try{const n=e.replace(/\s+/g," ").trim();if(!n||n.length<2||I(n))return;A=Date.now();let i=o||"Speaker",t=n;if(n.includes(`
`)){const s=n.split(`
`);s.length>=2&&s[0].length<35&&(i=s[0].trim(),t=s.slice(1).join(" ").trim())}else if(n.includes(":")&&n.indexOf(":")<30){const s=n.split(":");i=s[0].trim(),t=s.slice(1).join(":").trim()}if(!t||t.length<2||I(t))return;const a=Date.now(),f=t.toLowerCase().replace(/[^a-z0-9]/g,""),r=S.get(f);if(r&&a-r<2200)return;if(S.set(f,a),S.size>80)for(const[s,p]of S.entries())a-p>15e3&&S.delete(s);console.log(`[OiU Captions Found] ${i}: "${t}"`);const c={id:`seg_${a}_${Math.random().toString(36).substring(2,6)}`,sessionId:"meet_call",text:t,speakerId:i,startMs:a-1e3,endMs:a,isFinal:!0,confidence:.98};chrome.runtime.sendMessage({type:"TRANSCRIPT_SEGMENT",segment:c}).catch(()=>{})}catch(n){console.warn("[OiU] Error in caption processing (isolated):",n)}},k=function(){try{const e=document.querySelectorAll('[jsname="tgaKEf"], div.nMxLec, div.VbkSUe, div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]'),o=Date.now();e.forEach(n=>{var a;const i=n,t=(a=i.textContent)==null?void 0:a.trim();if(t&&t.length>1){i.dataset.oiuLastText=t,i.dataset.oiuSealedLength=String(t.length),i.dataset.oiuLastChangeTime=String(o);const f=t.toLowerCase().replace(/[^a-z0-9]/g,"");f&&S.set(f,o)}}),console.log(`[OiU] Baselined and sealed ${e.length} existing DOM captions so old past speech is not alerted.`)}catch(e){console.warn("[OiU] Error baselining existing captions:",e)}},N=function(){if(y)try{let e=document.querySelectorAll('[jsname="tgaKEf"]');e.length===0&&(e=document.querySelectorAll("div.nMxLec, div.VbkSUe"));let o=!1;e.length>0&&e.forEach(n=>{var d,l;if(n.closest('[aria-label*="chat" i], [jsname="xySENc"], [role="log"]'))return;const i=n,t=((d=i.textContent)==null?void 0:d.trim())||"";if(t.length<2)return;if(i.dataset.oiuLastText===t){o=!0;return}const a=Date.now(),f=Number(i.dataset.oiuLastChangeTime||"0");let r=Number(i.dataset.oiuSealedLength||"0");const c=i.dataset.oiuLastText||"";if(f>0&&a-f>1800&&t.length>r&&(r=c.length,i.dataset.oiuSealedLength=String(r)),r<t.length){const m=t.slice(r),h=m.match(/^([\s\S]*?[.?!])\s+(\S[\s\S]*)$/);h&&h[2]&&h[2].length>=2&&(r+=m.indexOf(h[2]),i.dataset.oiuSealedLength=String(r))}if(t.length-r>120){const m=t.slice(r),h=[];for(let g=0;g<m.length;g++)(m[g]==="?"||m[g]==="."||m[g]==="!")&&h.push(g);if(h.length>=1){const g=h[h.length-1]+1;r+=g,i.dataset.oiuSealedLength=String(r)}else if(m.length>180){const g=m.lastIndexOf(" ",m.length-80);g>40&&(r+=g+1,i.dataset.oiuSealedLength=String(r))}}i.dataset.oiuLastText=t,i.dataset.oiuLastChangeTime=String(a),o=!0;let s=t;if(r>0&&t.length>r&&(s=t.slice(r).trim()),s.length<2)return;const p=i.closest('div.nMxLec, div.iTTPOb, div[jsname="YSvyfd"]'),O=p==null?void 0:p.querySelector(".NWkf3b, .jxFHg, .zs7LEd, .bFfZTd"),u=((l=O==null?void 0:O.textContent)==null?void 0:l.trim())||"Speaker";b(s,u)}),o||document.querySelectorAll('div.iTTPOb, div.zT3Aid, div[jsname="YSvyfd"]').forEach(i=>{var O;if(i.closest('[aria-label*="chat" i], [jsname="xySENc"]'))return;const t=i,a=((O=t.textContent)==null?void 0:O.trim())||"";if(a.length<2||t.dataset.oiuLastText===a)return;const f=Date.now(),r=Number(t.dataset.oiuLastChangeTime||"0");let c=Number(t.dataset.oiuSealedLength||"0");const s=t.dataset.oiuLastText||"";if(r>0&&f-r>1800&&a.length>c&&(c=s.length,t.dataset.oiuSealedLength=String(c)),c<a.length){const u=a.slice(c),d=u.match(/^([\s\S]*?[.?!])\s+(\S[\s\S]*)$/);d&&d[2]&&d[2].length>=2&&(c+=u.indexOf(d[2]),t.dataset.oiuSealedLength=String(c))}if(a.length-c>120){const u=a.slice(c),d=[];for(let l=0;l<u.length;l++)(u[l]==="?"||u[l]==="."||u[l]==="!")&&d.push(l);if(d.length>=1){const l=d[d.length-1]+1;c+=l,t.dataset.oiuSealedLength=String(c)}else if(u.length>180){const l=u.lastIndexOf(" ",u.length-80);l>40&&(c+=l+1,t.dataset.oiuSealedLength=String(c))}}t.dataset.oiuLastText=a,t.dataset.oiuLastChangeTime=String(f);let p=a;c>0&&a.length>c&&(p=a.slice(c).trim()),!(p.length<2)&&b(p)})}catch(e){console.warn("[OiU] Safe isolated error in scanDOMForCaptions:",e)}},R=function(){if(!y)return;const e=Date.now();C(),e-_>15e3&&v>0&&e-v<1e4&&e-A>15e3&&e-M>35e3&&(console.log("[OiU Watchdog] Sound activity detected but Google Meet captions stalled for >15s. Auto-kickstarting captions..."),M=e,x())},V=function(){if(y)return;y=!0;const e=Date.now();_=e,A=e,v=0,M=0,E(),C(),k(),L(),w&&clearInterval(w),w=setInterval(N,600),T&&clearInterval(T),T=setInterval(R,4e3),console.log("[OiU] Dual-Engine monitoring active (Voice Engine + Captions Engine + Stalled Caption Watchdog).")},z=function(){y=!1,w&&(clearInterval(w),w=null),T&&(clearInterval(T),T=null),U(),E(),S.clear(),console.log("[OiU] Monitoring stopped.")};window.__oiuContentScriptActive=!0,chrome.runtime.sendMessage({type:"MEETING_TAB_DETECTED",payload:{url:window.location.href}}).catch(()=>{});let y=!1,w=null;const S=new Map;E();const D=["no chat messages yet","loading..","loading...","in-call messages","send a message","messages can only be seen","turn on captions","turn off captions","people","chat","activities","host controls","meeting details","more options","info"];let _=0,A=0,v=0,M=0;window.addEventListener("message",e=>{var o;((o=e.data)==null?void 0:o.source)==="OIU_MAIN_VOICE"&&(e.data.type==="VOICE_TRANSCRIPT"&&e.data.text&&(console.log(`[OiU Live Voice Heard]: "${e.data.text}"`),b(e.data.text,"Live Voice")),e.data.type==="AUDIO_LEVEL"&&typeof e.data.level=="number"&&(e.data.level>.04&&(v=Date.now()),chrome.runtime.sendMessage({type:"AUDIO_LEVEL",payload:{level:e.data.level,packetsCaptured:1}}).catch(()=>{})))});let T=null;chrome.runtime.onMessage.addListener((e,o,n)=>{if((e==null?void 0:e.type)==="START_MEET_MONITORING")return V(),n({success:!0,monitoring:!0}),!1;if((e==null?void 0:e.type)==="KICKSTART_MEET_CAPTIONS"||(e==null?void 0:e.type)==="TOGGLE_MEET_CAPTIONS")return x(),n({success:!0}),!1;if((e==null?void 0:e.type)==="STOP_MEET_MONITORING")return z(),n({success:!0,monitoring:!1}),!1})}
