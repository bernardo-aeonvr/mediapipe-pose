// Copyright 2023 The MediaPipe Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// http://www.apache.org/licenses/LICENSE-2.0

import { PoseLandmarker, FilesetResolver, DrawingUtils } from "https://cdn.skypack.dev/@mediapipe/tasks-vision@0.10.0";

const demosSection = document.getElementById("demos");
let poseLandmarker = undefined;
let runningMode = "IMAGE";
let enableWebcamButton;
let webcamRunning = false;
const videoHeight = "360px";
const videoWidth = "480px";

/* ================================
   ⚙️ Fullscreen helpers (nativo + soft)
   ================================ */
const liveViewFS = document.getElementById("liveView");
const fsBtnFS   = document.getElementById("fsButton");
const videoElFS = document.getElementById("webcam");
const canvasElFS = document.getElementById("output_canvas");

// Garantias iOS para o <video>
if (videoElFS) {
  videoElFS.setAttribute("playsinline", "");
  videoElFS.setAttribute("muted", "");
}

const isNativeFS = () =>
  document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;

const thisElemIsNativeFS = () =>
  document.fullscreenElement === liveViewFS ||
  document.webkitFullscreenElement === liveViewFS ||
  document.msFullscreenElement === liveViewFS;

const canElemFS =
  !!(liveViewFS?.requestFullscreen || liveViewFS?.webkitRequestFullscreen || liveViewFS?.msRequestFullscreen);

async function enterFS(el) {
  if (el.requestFullscreen) return el.requestFullscreen();
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.msRequestFullscreen) return el.msRequestFullscreen();
}
async function exitFS() {
  if (document.exitFullscreen) return document.exitFullscreen();
  if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
  if (document.msExitFullscreen) return document.msExitFullscreen();
}

function setSoftFS(on) {
  // "Soft fullscreen" mantém vídeo/canvas no DOM e preserva MediaPipe
  if (!liveViewFS) return;
  liveViewFS.classList.toggle("soft-fs", on);
  updateFSButtonUI(on || !!isNativeFS());
}

function updateFSButtonUI(full) {
  const label = fsBtnFS?.querySelector(".mdc-button__label");
  if (!fsBtnFS || !label) return;
  if (full) {
    fsBtnFS.classList.add("mdc-button--raised");
    fsBtnFS.classList.remove("mdc-button--outlined");
    fsBtnFS.setAttribute("aria-pressed", "true");
    label.textContent = "Exit Fullscreen";
  } else {
    fsBtnFS.classList.remove("mdc-button--raised");
    fsBtnFS.classList.add("mdc-button--outlined");
    fsBtnFS.setAttribute("aria-pressed", "false");
    label.textContent = "Fullscreen";
  }
}

async function goFullscreenPreferred() {
  // Preferir nativo (no container) quando disponível
  if (liveViewFS && canElemFS && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    try {
      await enterFS(liveViewFS);
      updateFSButtonUI(true);
      return true;
    } catch (_) {
      // bloqueado -> cai no soft
    }
  }
  // Fallback (iOS/gesto obrigatório)
  setSoftFS(true);
  return true;
}

// Expor um verificador para o predictWebcam não fixar 360x480 em FS
window.__liveViewIsFS = function () {
  if (!liveViewFS) return false;
  return thisElemIsNativeFS() || liveViewFS.classList.contains("soft-fs");
};

// Sincroniza UI quando sai por ESC/gesto do SO
["fullscreenchange", "webkitfullscreenchange", "MSFullscreenChange"].forEach((evt) => {
  document.addEventListener(evt, () => updateFSButtonUI(!!isNativeFS()));
});

// Botão Fullscreen (se existir no HTML)
if (fsBtnFS) {
  fsBtnFS.addEventListener("click", async () => {
    const nfs = !!isNativeFS();
    const softOn = liveViewFS?.classList.contains("soft-fs");
    if (nfs || softOn) {
      if (nfs) await exitFS();
      if (softOn) setSoftFS(false);
      updateFSButtonUI(false);
    } else {
      await goFullscreenPreferred();
    }
  });
}

// Tentar fullscreen ao carregar; se o navegador bloquear, tenta no primeiro gesto
(async () => {
  try { await goFullscreenPreferred(); } catch (_) { /* vai pro listener abaixo */ }
})();
const _activateOnGesture = async () => {
  document.removeEventListener("click", _activateOnGesture, true);
  document.removeEventListener("touchend", _activateOnGesture, true);
  try { await goFullscreenPreferred(); } catch (_) { setSoftFS(true); }
};
document.addEventListener("click", _activateOnGesture, true);
document.addEventListener("touchend", _activateOnGesture, true);

/* ================================
   🧠 MediaPipe Pose Landmarker
   ================================ */
// Before we can use PoseLandmarker class we must wait for it to finish loading.
const createPoseLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
  );

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task`,
      delegate: "GPU",
    },
    runningMode: runningMode,
    numPoses: 2,
  });

  demosSection?.classList?.remove("invisible");
};
createPoseLandmarker();

/********************************************************************
// Demo 1: detectOnClick em imagens
********************************************************************/
const imageContainers = document.getElementsByClassName("detectOnClick");
for (let i = 0; i < imageContainers.length; i++) {
  imageContainers[i].children[0].addEventListener("click", handleClick);
}
async function handleClick(event) {
  if (!poseLandmarker) {
    console.log("Wait for poseLandmarker to load before clicking!");
    return;
  }
  if (runningMode === "VIDEO") {
    runningMode = "IMAGE";
    await poseLandmarker.setOptions({ runningMode: "IMAGE" });
  }
  // Remove desenhados anteriores
  const allCanvas = event.target.parentNode.getElementsByClassName("canvas");
  for (let i = allCanvas.length - 1; i >= 0; i--) {
    const n = allCanvas[i];
    n.parentNode.removeChild(n);
  }
  poseLandmarker.detect(event.target, (result) => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("class", "canvas");
    canvas.setAttribute("width", event.target.naturalWidth + "px");
    canvas.setAttribute("height", event.target.naturalHeight + "px");
    canvas.style =
      "left: 0px;" +
      "top: 0px;" +
      "width: " + event.target.width + "px;" +
      "height: " + event.target.height + "px;";
    event.target.parentNode.appendChild(canvas);
    const canvasCtx = canvas.getContext("2d");
    const drawingUtils = new DrawingUtils(canvasCtx);
    for (const landmark of result.landmarks) {
      drawingUtils.drawLandmarks(landmark, {
        radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
      });
      drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
    }
  });
}

/********************************************************************
// Demo 2: Webcam contínua
********************************************************************/
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const drawingUtils = new DrawingUtils(canvasCtx);

// Check webcam support
const hasGetUserMedia = () => !!navigator.mediaDevices?.getUserMedia;

if (hasGetUserMedia()) {
  enableWebcamButton = document.getElementById("webcamButton");
  enableWebcamButton.addEventListener("click", enableCam);
  // Plus: garantir fullscreen no primeiro clique do botão da webcam, se ainda não estiver
  enableWebcamButton.addEventListener("click", async () => {
    if (!window.__liveViewIsFS?.()) {
      try { await goFullscreenPreferred(); } catch (_) { /* ignore */ }
    }
  });
} else {
  console.warn("getUserMedia() is not supported by your browser");
}

// Enable the live webcam view and start detection.
function enableCam() {
  if (!poseLandmarker) {
    console.log("Wait! poseLandmaker not loaded yet.");
    return;
  }

  if (webcamRunning === true) {
    webcamRunning = false;
    enableWebcamButton.innerText = "ENABLE PREDICTIONS";
  } else {
    webcamRunning = true;
    enableWebcamButton.innerText = "DISABLE PREDICTIONS";
  }

  const constraints = { video: true };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam, { once: true });
  });
}

let lastVideoTime = -1;
async function predictWebcam() {
  // 🔎 Em fullscreen (nativo ou soft), não force 360x480 — deixe o CSS cuidar
  const inFS = window.__liveViewIsFS?.() === true;
  if (!inFS) {
    canvasElement.style.height = videoHeight;
    video.style.height = videoHeight;
    canvasElement.style.width = videoWidth;
    video.style.width = videoWidth;
  } else {
    // Em fullscreen, remova tamanhos fixos para permitir 100vw/100vh via CSS
    canvasElement.style.width = "";
    canvasElement.style.height = "";
    video.style.width = "";
    video.style.height = "";
  }

  if (runningMode === "IMAGE") {
    runningMode = "VIDEO";
    await poseLandmarker.setOptions({ runningMode: "VIDEO" });
  }

  const startTimeMs = performance.now();
  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    poseLandmarker.detectForVideo(video, startTimeMs, (result) => {
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      for (const landmark of result.landmarks) {
        drawingUtils.drawLandmarks(landmark, {
          radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1),
        });
        drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
      }
      canvasCtx.restore();
    });
  }

  if (webcamRunning === true) {
    window.requestAnimationFrame(predictWebcam);
  }
}
