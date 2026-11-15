/**
 * ASTRUM — Гардероб (3D просмотр скинов и плащей, MineSkin и локальное хранилище)
 */

(() => {
  // Конфигурация
  // Если у вас развернут Cloudflare Worker, укажите его адрес здесь:
  const DEFAULT_WORKER_URL = window.WARDROBE_WORKER_URL || "https://wardrobe-api.astrums.pro";
  const MINESKIN_DIRECT_API = "https://api.mineskin.org/generate/upload";

  // Состояние
  let viewer = null;
  let originalSkinBlob = null;
  let originalSkinDataUrl = null;
  let originalModel = "classic"; // "classic" | "slim"
  let currentSkinBlob = null;
  let currentSkinDataUrl = null;
  let currentModel = "classic"; // "classic" | "slim"
  let currentCape = null; // null или объект плаща
  let isWalking = true;
  let walkAnimation = null;
  let lastGeneratedCommand = "";

  // Официальные плащи Minecraft, подтверждённые MineSkin (mineskin.org)
  const CAPES = [
    { id: "none", name: "Без плаща", url: null, mojangUrl: null, uuid: null },
    { id: "migrator", name: "Migrator", uuid: "5af20372-79e0-4e1f-80f8-6bd8e3135995", url: "../assets/wardrobe/capes/migrator.png", mojangUrl: "https://textures.minecraft.net/texture/2340c0e03dd24a11b15a8b33c2a7e9e32abb2051b2481d0ba7defd635ca7a933" },
    { id: "vanilla", name: "Vanilla", uuid: "7412868d-7be3-429f-b629-ed5074d2455c", url: "../assets/wardrobe/capes/vanilla.png", mojangUrl: "https://textures.minecraft.net/texture/f9a76537647989f9a0b6d001e320dac591c359e9e61a31f4ce11c88f207f0ad4" },
    { id: "15th-anniversary", name: "15 лет Minecraft", uuid: "ef9e95b6-48a3-4fd7-93d4-7e7d9448d2f1", url: "../assets/wardrobe/capes/15th-anniversary.png", mojangUrl: "https://textures.minecraft.net/texture/cd9d82ab17fd92022dbd4a86cde4c382a7540e117fae7b9a2853658505a80625" },
    { id: "purple-heart", name: "Twitch", uuid: "e7fcd100-d7dd-4c6c-a5f2-34bad18a3869", url: "../assets/wardrobe/capes/purple-heart.png", mojangUrl: "https://textures.minecraft.net/texture/cb40a92e32b57fd732a00fc325e7afb00a7ca74936ad50d8e860152e482cfbde" },
    { id: "cherry-blossom", name: "Сакура", uuid: "30743269-ab43-46e6-b25d-3b50b0f1ed41", url: "../assets/wardrobe/capes/cherry-blossom.png", mojangUrl: "https://textures.minecraft.net/texture/afd553b39358a24edfe3b8a9a939fa5fa4faa4d9a9c3d6af8eafb377fa05c2bb" },
    { id: "followers", name: "TikTok", uuid: "c3cec265-d3dc-4868-a793-b61b0ba10389", url: "../assets/wardrobe/capes/followers.png", mojangUrl: "https://textures.minecraft.net/texture/569b7f2a1d00d26f30efe3f9ab9ac817b1e6d35f4f3cfb0324ef2d328223d350" },
    { id: "menace", name: "Menace", uuid: "64eacd79-e44b-4af4-a894-4f56f5844e2f", url: "../assets/wardrobe/capes/menace.png", mojangUrl: "https://textures.minecraft.net/texture/b1fc59bc3de3cda3ed4d99c3d65b721c57cec900ece350cbda6f451099e078e7" },
    { id: "home", name: "Home", uuid: "0a22d0fe-c126-45e3-959d-0908d5fa5830", url: "../assets/wardrobe/capes/home.png", mojangUrl: "https://textures.minecraft.net/texture/4b5de481e1b41f51c678155ff965c7e9526c7c641aaaf97a501916c7cb101c4b" },
    { id: "yearn", name: "Yearn", uuid: "6e600ae7-14ee-438b-addc-713d143d29c4", url: "../assets/wardrobe/capes/yearn.png", mojangUrl: "https://textures.minecraft.net/texture/308b32a9e303155a0b4262f9e5483ad4a22e3412e84fe8385a0bdd73dc41fa89" },
    { id: "common", name: "Common", uuid: "b9d4f2e0-6109-43f7-97aa-84250ce3c1dd", url: "../assets/wardrobe/capes/common.png", mojangUrl: "https://textures.minecraft.net/texture/5ec930cdd2629c8771655c60eebeb867b4b6559b0e6d3bc71c40c96347fa03f0" },
    { id: "pan", name: "Pancape", uuid: "2ed5269a-076e-4a3c-834a-2837d5b578f2", url: "../assets/wardrobe/capes/pan.png", mojangUrl: "https://textures.minecraft.net/texture/28de4a81688ad18b49e735a273e086c18f1e3966956123ccb574034c06f5d336" },
    { id: "copper", name: "Медный", uuid: "b2b7e99f-e990-47eb-a26a-791c5d6228d3", url: "../assets/wardrobe/capes/copper.png", mojangUrl: "https://textures.minecraft.net/texture/5e6f3193e74cd16cdd6637d9bae5484e3a37ff2a14c2d157c659a07810b1bdca" },
    { id: "zombie-horse", name: "Зомби-лошадь", uuid: "bb083095-4854-45c2-9e7b-1f569b049934", url: "../assets/wardrobe/capes/zombie-horse.png", mojangUrl: "https://textures.minecraft.net/texture/a3f6e4f14801f3ea55e3d95b9b4ef3b5e8802d947f669de93d6ec4b9354a436b" }
  ];

  // DOM Элементы
  const canvas = document.getElementById("skin-canvas");
  const dropzone = document.getElementById("dropzone");
  const skinFileInput = document.getElementById("skin-file-input");
  const skinUrlInput = document.getElementById("skin-url-input");
  const skinUrlBtn = document.getElementById("skin-url-btn");
  const capesGrid = document.getElementById("capes-grid");
  const btnWalkToggle = document.getElementById("btn-walk-toggle");
  const btnResetView = document.getElementById("btn-reset-view");
  const modelBtns = document.querySelectorAll(".model-opt");
  const btnGenerate = document.getElementById("btn-generate");
  const resultBox = document.getElementById("result-box");
  const resultCode = document.getElementById("result-code");
  const btnCopy = document.getElementById("btn-copy");
  const btnSaveSkin = document.getElementById("btn-save-skin");
  const inventoryGrid = document.getElementById("inventory-grid");
  const toast = document.getElementById("toast");

  // Всплывающее уведомление
  let toastTimer;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }

  // 1. Инициализация 3D SkinViewer
  function initViewer() {
    if (!window.skinview3d) {
      console.error("skinview3d не загружен");
      return;
    }

    const rect = canvas.getBoundingClientRect();
    viewer = new skinview3d.SkinViewer({
      canvas: canvas,
      width: rect.width || 420,
      height: rect.height || 520,
      zoom: 0.85,
    });

    viewer.renderer.setClearColor(0, 0); // Прозрачный фон
    viewer.camera.position.z = 70;
    viewer.camera.position.y = -5;

    // Анимация ходьбы
    walkAnimation = new skinview3d.WalkingAnimation();
    walkAnimation.speed = 0.6;
    viewer.animation = walkAnimation;

    // Адаптивный ресайз
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width && height) {
          viewer.width = width;
          viewer.height = height;
        }
      }
    });
    resizeObserver.observe(canvas.parentElement);

    // Загрузка дефолтного скина
    loadDefaultSkin();
  }

  async function loadDefaultSkin() {
    try {
      const res = await fetch("../assets/wardrobe/default-skin.png");
      if (res.ok) {
        const blob = await res.blob();
        await applySkinBlob(blob, false);
      }
    } catch (e) {
      console.warn("Не удалось загрузить default-skin.png:", e);
    }
  }

  // 2. Обработка и проверка скина
  async function processSkinImage(imageSource) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        if (w !== 64 || (h !== 64 && h !== 32)) {
          reject(new Error(`Неверный размер скина: ${w}×${h}. Скин должен быть 64×64 или 64×32.`));
          return;
        }

        const cvs = document.createElement("canvas");
        cvs.width = 64;
        cvs.height = 64;
        const ctx = cvs.getContext("2d", { willReadFrequently: true });

        // Если скин старого формата 64x32 — конвертируем в 64x64
        if (h === 32) {
          ctx.drawImage(img, 0, 0);
          // Зеркалирование правой ноги на левую (координаты Майнкрафт 1.8)
          copyFlipped(ctx, 0, 16, 16, 16, 16, 48); // правая нога -> левая нога
          copyFlipped(ctx, 40, 16, 16, 16, 32, 48); // правая рука -> левая рука
        } else {
          ctx.drawImage(img, 0, 0);
        }

        // Автоопределение модели Classic (Steve) vs Slim (Alex)
        // Проверяем 4-й пиксель правой руки: если прозрачен — Alex (slim), иначе Steve (classic)
        const imgData = ctx.getImageData(0, 0, 64, 64);
        const isSlim = detectSlim(imgData);

        cvs.toBlob(blob => {
          resolve({
            blob,
            dataUrl: cvs.toDataURL("image/png"),
            detectedModel: isSlim ? "slim" : "classic",
          });
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Не удалось прочитать изображение скина"));
      img.src = typeof imageSource === "string" ? imageSource : URL.createObjectURL(imageSource);
    });
  }

  function copyFlipped(ctx, sx, sy, sw, sh, dx, dy) {
    ctx.save();
    ctx.translate(dx + sw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  }

  function detectSlim(imgData) {
    // В скинах Slim (Alex) правая рука имеет ширину 3 пикселя вместо 4.
    // Столбец пикселей x=54..55, y=20..31 в текстуре абсолютно прозрачен.
    const data = imgData.data;
    let transparentCount = 0;
    let checkedCount = 0;

    for (let y = 20; y < 32; y++) {
      const idx = (y * 64 + 54) * 4;
      const alpha = data[idx + 3];
      checkedCount++;
      if (alpha === 0) transparentCount++;
    }

    return transparentCount / checkedCount > 0.8;
  }

  // Вспомогательные функции для попиксельной работы с текстурой
  function getPixel(data, x, y) {
    const idx = (y * 64 + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
  }

  function setPixel(data, x, y, r, g, b, a) {
    const idx = (y * 64 + x) * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = a;
  }

  function clearPixel(data, x, y) {
    const idx = (y * 64 + x) * 4;
    data[idx] = 0;
    data[idx + 1] = 0;
    data[idx + 2] = 0;
    data[idx + 3] = 0;
  }

  // Конвертация текстуры скина между Classic (4px руки) и Slim (3px руки)
  // Устраняет артефакты (полосы смещения UV, синие пиксели от рукавов на предплечьях)
  function convertClassicToSlimData(imgData) {
    const src = new Uint8ClampedArray(imgData.data);
    const dst = imgData.data;

    function convertArm(baseX, topY, sideY) {
      // 1. Верхний и нижний торцы руки (y = topY .. topY + 3)
      for (let y = topY; y < topY + 4; y++) {
        // Верхний торец: Classic 4px (baseX+4..baseX+7) -> Slim 3px (baseX+4..baseX+6)
        const p0 = getPixel(src, baseX + 4, y);
        const p1 = getPixel(src, baseX + 5, y);
        const p3 = getPixel(src, baseX + 7, y);
        setPixel(dst, baseX + 4, y, p0[0], p0[1], p0[2], p0[3]);
        setPixel(dst, baseX + 5, y, p1[0], p1[1], p1[2], p1[3]);
        setPixel(dst, baseX + 6, y, p3[0], p3[1], p3[2], p3[3]);

        // Нижний торец (ладонь): Classic 4px (baseX+8..baseX+11) -> Slim 3px (baseX+7..baseX+9)
        const b0 = getPixel(src, baseX + 8, y);
        const b1 = getPixel(src, baseX + 9, y);
        const b2 = getPixel(src, baseX + 10, y);
        setPixel(dst, baseX + 7, y, b0[0], b0[1], b0[2], b0[3]);
        setPixel(dst, baseX + 8, y, b1[0], b1[1], b1[2], b1[3]);
        setPixel(dst, baseX + 9, y, b2[0], b2[1], b2[2], b2[3]);

        // Очищаем неиспользуемые пиксели блока
        for (let x = baseX + 10; x < baseX + 16; x++) {
          clearPixel(dst, x, y);
        }
      }

      // 2. Боковые грани руки (y = sideY .. sideY + 11)
      for (let y = sideY; y < sideY + 12; y++) {
        // Грань 0 (внешняя/внутренняя): 4px остается на месте
        for (let x = 0; x < 4; x++) {
          const p = getPixel(src, baseX + x, y);
          setPixel(dst, baseX + x, y, p[0], p[1], p[2], p[3]);
        }

        // Грань 1 (передняя): Classic 4px (baseX+4..7) -> Slim 3px (baseX+4..6)
        const f0 = getPixel(src, baseX + 4, y);
        const f1 = getPixel(src, baseX + 5, y);
        const f3 = getPixel(src, baseX + 7, y);
        setPixel(dst, baseX + 4, y, f0[0], f0[1], f0[2], f0[3]);
        setPixel(dst, baseX + 5, y, f1[0], f1[1], f1[2], f1[3]);
        setPixel(dst, baseX + 6, y, f3[0], f3[1], f3[2], f3[3]);

        // Грань 2 (внутренняя/внешняя): Classic 4px (baseX+8..11) сдвигается на 1px влево (baseX+7..10)
        for (let x = 0; x < 4; x++) {
          const p = getPixel(src, baseX + 8 + x, y);
          setPixel(dst, baseX + 7 + x, y, p[0], p[1], p[2], p[3]);
        }

        // Грань 3 (задняя): Classic 4px (baseX+12..15) -> Slim 3px (baseX+11..13)
        const k0 = getPixel(src, baseX + 12, y);
        const k1 = getPixel(src, baseX + 13, y);
        const k3 = getPixel(src, baseX + 15, y);
        setPixel(dst, baseX + 11, y, k0[0], k0[1], k0[2], k0[3]);
        setPixel(dst, baseX + 12, y, k1[0], k1[1], k1[2], k1[3]);
        setPixel(dst, baseX + 13, y, k3[0], k3[1], k3[2], k3[3]);

        // Очищаем последние 2 столбца до полной прозрачности
        clearPixel(dst, baseX + 14, y);
        clearPixel(dst, baseX + 15, y);
      }
    }

    convertArm(40, 16, 20); // Правая рука (основной слой)
    convertArm(40, 32, 36); // Правая рука (второй слой / оверлей)
    convertArm(32, 48, 52); // Левая рука (основной слой)
    convertArm(48, 48, 52); // Левая рука (второй слой / оверлей)
  }

  function convertSlimToClassicData(imgData) {
    const src = new Uint8ClampedArray(imgData.data);
    const dst = imgData.data;

    function convertArm(baseX, topY, sideY) {
      // 1. Верхний и нижний торцы руки (y = topY .. topY + 3)
      for (let y = topY; y < topY + 4; y++) {
        // Верхний торец: Slim 3px (baseX+4..6) -> Classic 4px (baseX+4..7)
        const p0 = getPixel(src, baseX + 4, y);
        const p1 = getPixel(src, baseX + 5, y);
        const p2 = getPixel(src, baseX + 6, y);
        setPixel(dst, baseX + 4, y, p0[0], p0[1], p0[2], p0[3]);
        setPixel(dst, baseX + 5, y, p1[0], p1[1], p1[2], p1[3]);
        setPixel(dst, baseX + 6, y, p1[0], p1[1], p1[2], p1[3]);
        setPixel(dst, baseX + 7, y, p2[0], p2[1], p2[2], p2[3]);

        // Нижний торец: Slim 3px (baseX+7..9) -> Classic 4px (baseX+8..11)
        const b0 = getPixel(src, baseX + 7, y);
        const b1 = getPixel(src, baseX + 8, y);
        const b2 = getPixel(src, baseX + 9, y);
        setPixel(dst, baseX + 8, y, b0[0], b0[1], b0[2], b0[3]);
        setPixel(dst, baseX + 9, y, b1[0], b1[1], b1[2], b1[3]);
        setPixel(dst, baseX + 10, y, b1[0], b1[1], b1[2], b1[3]);
        setPixel(dst, baseX + 11, y, b2[0], b2[1], b2[2], b2[3]);

        for (let x = baseX + 12; x < baseX + 16; x++) {
          clearPixel(dst, x, y);
        }
      }

      // 2. Боковые грани руки (y = sideY .. sideY + 11)
      for (let y = sideY; y < sideY + 12; y++) {
        for (let x = 0; x < 4; x++) {
          const p = getPixel(src, baseX + x, y);
          setPixel(dst, baseX + x, y, p[0], p[1], p[2], p[3]);
        }

        // Грань 1: Slim 3px (baseX+4..6) -> Classic 4px (baseX+4..7)
        const f0 = getPixel(src, baseX + 4, y);
        const f1 = getPixel(src, baseX + 5, y);
        const f2 = getPixel(src, baseX + 6, y);
        setPixel(dst, baseX + 4, y, f0[0], f0[1], f0[2], f0[3]);
        setPixel(dst, baseX + 5, y, f1[0], f1[1], f1[2], f1[3]);
        setPixel(dst, baseX + 6, y, f1[0], f1[1], f1[2], f1[3]);
        setPixel(dst, baseX + 7, y, f2[0], f2[1], f2[2], f2[3]);

        // Грань 2: сдвигаем на 1px вправо обратно на baseX+8..11
        for (let x = 0; x < 4; x++) {
          const p = getPixel(src, baseX + 7 + x, y);
          setPixel(dst, baseX + 8 + x, y, p[0], p[1], p[2], p[3]);
        }

        // Грань 3: Slim 3px (baseX+11..13) -> Classic 4px (baseX+12..15)
        const k0 = getPixel(src, baseX + 11, y);
        const k1 = getPixel(src, baseX + 12, y);
        const k2 = getPixel(src, baseX + 13, y);
        setPixel(dst, baseX + 12, y, k0[0], k0[1], k0[2], k0[3]);
        setPixel(dst, baseX + 13, y, k1[0], k1[1], k1[2], k1[3]);
        setPixel(dst, baseX + 14, y, k1[0], k1[1], k1[2], k1[3]);
        setPixel(dst, baseX + 15, y, k2[0], k2[1], k2[2], k2[3]);
      }
    }

    convertArm(40, 16, 20);
    convertArm(40, 32, 36);
    convertArm(32, 48, 52);
    convertArm(48, 48, 52);
  }

  function convertSkinModel(sourceImgOrDataUrl, targetModel) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const cvs = document.createElement("canvas");
        cvs.width = 64;
        cvs.height = 64;
        const ctx = cvs.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, 64, 64);
        if (targetModel === "slim") {
          convertClassicToSlimData(imgData);
        } else {
          convertSlimToClassicData(imgData);
        }
        ctx.putImageData(imgData, 0, 0);

        cvs.toBlob(blob => {
          resolve({
            blob,
            dataUrl: cvs.toDataURL("image/png")
          });
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Не удалось обработать текстуру скина для конвертации"));
      img.src = sourceImgOrDataUrl;
    });
  }

  async function applySkinBlob(blob, autoModel = true) {
    try {
      const processed = await processSkinImage(blob);
      originalSkinBlob = processed.blob;
      originalSkinDataUrl = processed.dataUrl;
      originalModel = processed.detectedModel;

      if (autoModel) {
        currentModel = processed.detectedModel;
      }

      modelBtns.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.model === currentModel);
      });

      if (currentModel === originalModel) {
        currentSkinBlob = originalSkinBlob;
        currentSkinDataUrl = originalSkinDataUrl;
      } else {
        const converted = await convertSkinModel(originalSkinDataUrl, currentModel);
        currentSkinBlob = converted.blob;
        currentSkinDataUrl = converted.dataUrl;
      }

      if (viewer) {
        viewer.loadSkin(currentSkinDataUrl, {
          model: currentModel === "slim" ? "slim" : "default",
        });
      }

      // Скрываем прошлый результат генерации при загрузке нового скина
      if (resultBox) resultBox.hidden = true;

    } catch (err) {
      alert(err.message || "Ошибка обработки скина");
    }
  }

  async function setModel(model) {
    if (currentModel === model && currentSkinDataUrl) return;
    currentModel = model;
    modelBtns.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.model === model);
    });

    if (!originalSkinDataUrl) return;

    if (currentModel === originalModel) {
      currentSkinBlob = originalSkinBlob;
      currentSkinDataUrl = originalSkinDataUrl;
    } else {
      const converted = await convertSkinModel(originalSkinDataUrl, currentModel);
      currentSkinBlob = converted.blob;
      currentSkinDataUrl = converted.dataUrl;
    }

    if (viewer) {
      viewer.loadSkin(currentSkinDataUrl, {
        model: currentModel === "slim" ? "slim" : "default",
      });
    }
  }

  // 3. Выбор и отрисовка плащей
  function initCapes() {
    // Удаляем старый кэш динамических плащей, если он остался в браузере
    try {
      localStorage.removeItem("astrum_cached_dynamic_capes");
    } catch (e) {}

    if (!capesGrid) return;
    capesGrid.innerHTML = "";

    CAPES.forEach(cape => {
      const card = document.createElement("div");
      card.className = "cape-card" + (cape.id === "none" ? " active" : "");
      card.dataset.capeId = cape.id;
      card.title = cape.name;

      const thumb = document.createElement("div");
      thumb.className = "cape-thumb";

      const capeSrc = cape.url || cape.mojangUrl;
      if (capeSrc) {
        const cvs = document.createElement("canvas");
        cvs.width = 40;
        cvs.height = 64;
        const ctx = cvs.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          // Вырезаем лицевую часть плаща из текстуры (координаты 1, 1, 10, 16)
          ctx.drawImage(img, 1, 1, 10, 16, 0, 0, 40, 64);
        };
        img.onerror = () => {
          if (cape.mojangUrl && img.src !== cape.mojangUrl) {
            img.src = cape.mojangUrl;
          }
        };
        img.src = capeSrc;
        thumb.appendChild(cvs);
      } else {
        const noneIcon = document.createElement("div");
        noneIcon.className = "cape-none-icon";
        noneIcon.textContent = "✕";
        thumb.appendChild(noneIcon);
      }

      const name = document.createElement("span");
      name.className = "cape-name";
      name.textContent = cape.name;

      card.appendChild(thumb);
      card.appendChild(name);

      card.addEventListener("click", () => selectCape(cape));
      capesGrid.appendChild(card);
    });

    // Проверка рабочих плащей строго через официальный API mineskin.org
    syncWorkingCapesFromMineskin();
  }

  function selectCape(cape) {
    currentCape = (cape.url || cape.mojangUrl) ? cape : null;
    document.querySelectorAll(".cape-card").forEach(c => {
      c.classList.toggle("active", c.dataset.capeId === cape.id);
    });

    if (viewer) {
      const capeUrl = currentCape ? (currentCape.url || currentCape.mojangUrl) : null;
      viewer.loadCape(capeUrl);
    }
  }

  // Проверка рабочих плащей строго через mineskin.org (оставляем только публично поддерживаемые MineSkin)
  async function syncWorkingCapesFromMineskin() {
    try {
      const res = await fetch("https://api.mineskin.org/v2/capes", {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || !Array.isArray(data.capes)) return;

      // mineskin.org возвращает supported: true и support: "public" для рабочих плащей
      const supportedUuids = new Set(
        data.capes
          .filter(c => c.supported === true && c.support === "public")
          .map(c => String(c.uuid).toLowerCase())
      );

      // Скрываем плащи, если они не поддерживаются mineskin.org
      const validCapes = CAPES.filter(c => c.id === "none" || (c.uuid && supportedUuids.has(String(c.uuid).toLowerCase())));
      if (validCapes.length > 0 && validCapes.length !== CAPES.length) {
        CAPES.length = 0;
        CAPES.push(...validCapes);
        if (capesGrid) {
          const cards = capesGrid.querySelectorAll(".cape-card");
          cards.forEach(card => {
            const cid = card.dataset.capeId;
            if (cid !== "none" && !validCapes.some(vc => vc.id === cid)) {
              card.remove();
            }
          });
        }
      }
    } catch (e) {
      // При отсутствии сети или блокировке CORS используется стандартный проверенный список MineSkin
    }
  }

  // 4. Генерация ссылки через MineSkin (Cloudflare Worker или прямой запрос)
  async function generateSkinUrl() {
    if (!currentSkinBlob) {
      alert("Сначала выберите или загрузите скин!");
      return;
    }

    btnGenerate.classList.add("loading");
    const originalText = btnGenerate.querySelector("span").textContent;
    btnGenerate.querySelector("span").textContent = "Генерируем ссылку...";

    try {
      let result = null;

      // Если указан Worker URL — пробуем отправить запрос через него
      if (DEFAULT_WORKER_URL) {
        try {
          const fd = new FormData();
          fd.append("skin", currentSkinBlob, "skin.png");
          fd.append("model", currentModel);
          if (currentCape && currentCape.uuid) {
            fd.append("cape", currentCape.uuid);
          }

          const res = await fetch(DEFAULT_WORKER_URL, {
            method: "POST",
            body: fd,
          });

          if (res.ok) {
            const data = await res.json();
            const rawSkinId = data.skinId || data.idStr || data.uuid || "";
            // Удаляем дефисы, так как плагин SkinsRestorer в игре требует сплошной 32-символьный hex ID
            const skinId = String(rawSkinId).replace(/-/g, "");
            const rawMineskinUrl = (data.mineskinUrl && !data.mineskinUrl.endsWith("/0"))
              ? data.mineskinUrl
              : (data.url && !data.url.endsWith("/0") ? data.url : (skinId ? `https://minesk.in/${skinId}` : ""));
            const mineskinUrl = rawMineskinUrl.replace(/minesk\.in\/([0-9a-fA-F-]+)/i, (m, id) => `minesk.in/${id.replace(/-/g, "")}`);
            const textureUrl = (data.textureUrl && !data.textureUrl.endsWith("/0")) ? data.textureUrl : (data.data?.texture?.url || "");
            const mineskinPage = data.mineskinPage || (skinId ? `https://mineskin.org/${skinId}` : "");

            // Приоритет minesk.in: SkinsRestorer требует ссылку minesk.in, чтобы применился плащ и подпись профиля!
            const finalUrl = (mineskinUrl && !mineskinUrl.endsWith("/0")) ? mineskinUrl : textureUrl;
            if (finalUrl) {
              result = {
                success: true,
                url: finalUrl,
                textureUrl,
                mineskinUrl,
                mineskinPage,
                skinId,
                capeWarning: data.capeWarning || null,
                capeApplied: Boolean(data.capeApplied),
                command: `/skin url "${finalUrl}" ${currentModel}`,
              };
            } else {
              console.warn("Воркер вернул неполный URL, переключаемся на прямой запрос:", data);
            }
          } else {
            const errData = await res.json().catch(() => ({}));
            const errMsg = errData.error || res.statusText || `Ошибка сервера (${res.status})`;
            // Если ошибка связана с требованием API-ключа для плащей или неверным форматом файла — сразу показываем её пользователю
            if (res.status === 400 || errData.errorCode === "MINESKIN_API_KEY_REQUIRED" || (currentCape && currentCape.uuid)) {
              throw new Error(errMsg);
            }
            console.warn(`Воркер ответил кодом ${res.status}:`, errMsg);
          }
        } catch (workerErr) {
          if (workerErr.message && (workerErr.message.includes("API-ключ") || workerErr.message.includes("плащ"))) {
            throw workerErr;
          }
          console.warn("Ошибка обращения к воркеру, переключаемся на прямой запрос:", workerErr);
        }
      }

      // Если через воркер результат не получен — используем прямой запрос к MineSkin API
      if (!result) {
        btnGenerate.querySelector("span").textContent = "Загружаем в MineSkin...";

        const fd = new FormData();
        fd.append("file", currentSkinBlob, "skin.png");
        fd.append("model", currentModel === "slim" ? "slim" : "steve");
        fd.append("visibility", "1");
        if (currentCape && currentCape.uuid) {
          fd.append("cape", currentCape.uuid);
        }

        const res = await fetch(MINESKIN_DIRECT_API, {
          method: "POST",
          body: fd,
        });

        const msText = await res.text();
        let data = null;
        try {
          data = JSON.parse(msText);
        } catch {
          throw new Error(`Сервер MineSkin временно перегружен (код ${res.status}). Попробуйте ещё раз.`);
        }

        if (!res.ok || data.error) {
          const rawErr = data.error || data.message || `Ошибка MineSkin API (${res.status})`;
          if (currentCape && currentCape.uuid && (rawErr.includes("requires an API key") || data.errorCode === "unauthorized")) {
            throw new Error("MineSkin требует API-ключ для генерации скина с плащом.\n\nДобавьте переменную MINESKIN_API_KEY в настройках вашего Cloudflare Worker (получить ключ бесплатно: https://mineskin.org/apikey) либо выберите вариант «Без плаща».");
          }
          throw new Error(rawErr);
        }

        // Извлекаем правильные данные из ответа MineSkin (v1/v2 compatibility)
        const skinId = data.idStr || data.uuid || data.data?.uuid || (data.id && data.id !== 0 ? String(data.id) : "");
        const mineskinUrl = skinId ? `https://minesk.in/${skinId}` : "";
        const textureUrl = data.data?.texture?.url || data.texture?.url || data.data?.texture?.urls?.skin || "";
        const mineskinPage = skinId ? `https://mineskin.org/${skinId}` : "";

        // Приоритет отдаем minesk.in для корректной работы плащей в SkinsRestorer
        const finalUrl = (mineskinUrl && !mineskinUrl.endsWith("/0")) ? mineskinUrl : textureUrl;
        if (!finalUrl) {
          throw new Error("Сервер MineSkin не вернул валидный URL скина");
        }

        result = {
          success: true,
          url: finalUrl,
          mineskinUrl,
          mineskinPage,
          textureUrl,
          skinId,
          command: `/skin url "${finalUrl}" ${currentModel}`,
        };
      }

      if (!result || !result.command) {
        throw new Error("Не удалось получить команду скина");
      }

      lastGeneratedCommand = result.command;
      resultCode.textContent = result.command;

      const extraWrap = document.getElementById("result-extra");
      const mineskinLink = document.getElementById("result-mineskin-link");
      if (extraWrap && mineskinLink) {
        const pageUrl = result.mineskinPage || (result.skinId ? `https://mineskin.org/${result.skinId}` : "");
        if (pageUrl) {
          mineskinLink.href = pageUrl;
          extraWrap.hidden = false;
        } else {
          extraWrap.hidden = true;
        }
      }

      resultBox.hidden = false;
      resultBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (result.capeApplied || (currentCape && currentCape.uuid)) {
        showToast("Скин и плащ успешно готовы!");
      } else {
        showToast("Ссылка успешно сгенерирована!");
      }

    } catch (err) {
      console.error(err);
      alert(`Не удалось сгенерировать скин: ${err.message}\n\nПопробуйте ещё раз через несколько секунд.`);
    } finally {
      btnGenerate.classList.remove("loading");
      btnGenerate.querySelector("span").textContent = originalText;
    }
  }

  // 5. Локальное хранилище скинов игрока (IndexedDB)
  const DB_NAME = "AstrumWardrobeDB";
  const DB_VERSION = 1;
  const STORE_NAME = "saved_skins";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveSkinToWardrobe() {
    if (!currentSkinDataUrl) {
      alert("Сначала загрузите скин для сохранения!");
      return;
    }

    const defaultName = `Скин ${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}`;
    const name = prompt("Введите название для скина:", defaultName);
    if (name === null) return;

    const skinItem = {
      id: "skin_" + Date.now(),
      name: name.trim() || defaultName,
      date: new Date().toISOString(),
      model: currentModel,
      capeId: currentCape ? currentCape.id : "none",
      capeUrl: currentCape ? currentCape.url : null,
      dataUrl: currentSkinDataUrl,
      command: lastGeneratedCommand || "",
    };

    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(skinItem);
      tx.oncomplete = () => {
        showToast("Скин сохранён в гардероб!");
        renderWardrobeInventory();
      };
    } catch (e) {
      console.error("IndexedDB error:", e);
      // Fallback на localStorage
      try {
        const raw = localStorage.getItem("astrum_saved_skins") || "[]";
        const list = JSON.parse(raw);
        list.unshift(skinItem);
        localStorage.setItem("astrum_saved_skins", JSON.stringify(list.slice(0, 15)));
        showToast("Скин сохранён в гардероб!");
        renderWardrobeInventory();
      } catch (err) {
        alert("Не удалось сохранить скин (память браузера заполнена)");
      }
    }
  }

  async function loadAllSavedSkins() {
    try {
      const db = await openDb();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result.reverse());
        req.onerror = () => resolve([]);
      });
    } catch {
      try {
        const raw = localStorage.getItem("astrum_saved_skins") || "[]";
        return JSON.parse(raw);
      } catch {
        return [];
      }
    }
  }

  async function deleteSavedSkin(id) {
    if (!confirm("Удалить этот скин из гардероба?")) return;
    try {
      const db = await openDb();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => {
        showToast("Скин удален");
        renderWardrobeInventory();
      };
    } catch {
      try {
        const raw = localStorage.getItem("astrum_saved_skins") || "[]";
        let list = JSON.parse(raw);
        list = list.filter(x => x.id !== id);
        localStorage.setItem("astrum_saved_skins", JSON.stringify(list));
        showToast("Скин удален");
        renderWardrobeInventory();
      } catch {}
    }
  }

  function renderAvatarHead(dataUrl, canvas) {
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Слой 1: лицо (координаты 8, 8, 8, 8)
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height);
      // Слой 2: шлем/волосы (координаты 40, 8, 8, 8)
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, canvas.width, canvas.height);
    };
    img.src = dataUrl;
  }

  async function renderWardrobeInventory() {
    if (!inventoryGrid) return;
    const skins = await loadAllSavedSkins();

    if (!skins || skins.length === 0) {
      inventoryGrid.innerHTML = `
        <div class="inventory-empty">
          У вас пока нет сохранённых скинов.<br />
          Загрузите скин выше и нажмите <strong>«Сохранить в гардероб»</strong>, чтобы быстро примерять его в любой момент.
        </div>
      `;
      return;
    }

    inventoryGrid.innerHTML = "";

    skins.forEach(item => {
      const card = document.createElement("div");
      card.className = "skin-card";

      const top = document.createElement("div");
      top.className = "skin-card-top";

      const avatar = document.createElement("div");
      avatar.className = "skin-card-avatar";
      const headCvs = document.createElement("canvas");
      headCvs.width = 44;
      headCvs.height = 44;
      renderAvatarHead(item.dataUrl, headCvs);
      avatar.appendChild(headCvs);

      const info = document.createElement("div");
      info.className = "skin-card-info";

      const name = document.createElement("div");
      name.className = "skin-card-name";
      name.textContent = item.name;

      const meta = document.createElement("div");
      meta.className = "skin-card-meta";
      const tag = document.createElement("span");
      tag.className = "skin-card-tag";
      tag.textContent = item.model === "slim" ? "Slim (3px)" : "Classic (4px)";
      meta.appendChild(tag);

      if (item.capeId && item.capeId !== "none") {
        const capeTag = document.createElement("span");
        capeTag.className = "skin-card-tag";
        capeTag.textContent = "Плащ";
        meta.appendChild(capeTag);
      }

      info.appendChild(name);
      info.appendChild(meta);

      top.appendChild(avatar);
      top.appendChild(info);

      // Кнопки
      const buttons = document.createElement("div");
      buttons.className = "skin-card-buttons";

      const btnApply = document.createElement("button");
      btnApply.type = "button";
      btnApply.className = "skin-card-btn";
      btnApply.textContent = "Примерить";
      btnApply.addEventListener("click", () => {
        // Применяем скин
        fetch(item.dataUrl)
          .then(r => r.blob())
          .then(blob => applySkinBlob(blob, false))
          .then(() => setModel(item.model));

        // Применяем плащ
        const foundCape = CAPES.find(c => c.id === item.capeId) || CAPES[0];
        selectCape(foundCape);

        if (item.command) {
          lastGeneratedCommand = item.command;
          resultCode.textContent = item.command;
          resultBox.hidden = false;
        }

        window.scrollTo({ top: 120, behavior: "smooth" });
        showToast(`Скин «${item.name}» надет`);
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "skin-card-btn skin-card-del";
      btnDel.title = "Удалить из гардероба";
      btnDel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
      btnDel.addEventListener("click", () => deleteSavedSkin(item.id));

      buttons.appendChild(btnApply);
      buttons.appendChild(btnDel);

      card.appendChild(top);
      card.appendChild(buttons);

      inventoryGrid.appendChild(card);
    });
  }

  // 6. Слушатели событий интерфейса
  function bindEvents() {
    // Выбор файла через input
    skinFileInput.addEventListener("change", e => {
      const file = e.target.files && e.target.files[0];
      if (file) applySkinBlob(file, true);
    });

    // Drag and Drop
    ["dragenter", "dragover"].forEach(evt => {
      dropzone.addEventListener(evt, e => {
        e.preventDefault();
        dropzone.classList.add("dragover");
      });
    });
    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, e => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
      });
    });
    dropzone.addEventListener("drop", e => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) applySkinBlob(file, true);
    });

    // Загрузка скина по нику лицензионного аккаунта или прямой ссылке
    const loadSkinFromInput = async () => {
      const rawInput = (skinUrlInput.value || "").trim();
      if (!rawInput) {
        alert("Введите никнейм лицензионного аккаунта или ссылку на скин!");
        return;
      }

      skinUrlBtn.disabled = true;
      const originalText = skinUrlBtn.textContent;
      skinUrlBtn.textContent = "Загрузка...";

      try {
        let imageUrl = rawInput;
        let forcedModel = null;
        let playerName = null;

        const isUrl = /^https?:\/\//i.test(rawInput);

        if (!isUrl) {
          // Валидация никнейма Minecraft (1-16 символов: буквы, цифры, _)
          if (!/^[a-zA-Z0-9_]{1,16}$/.test(rawInput)) {
            throw new Error(`«${rawInput}» не является корректным никнеймом Minecraft или ссылкой. Никнейм содержит от 1 до 16 символов (только латиница, цифры и символ «_»).`);
          }

          skinUrlBtn.textContent = "Ищем аккаунт...";

          // 1. Проверяем профиль через PlayerDB (Mojang API с открытым CORS)
          let foundSkin = false;
          try {
            const pdbRes = await fetch(`https://playerdb.co/api/player/minecraft/${encodeURIComponent(rawInput)}`);
            if (pdbRes.ok) {
              const pdbData = await pdbRes.json();
              if (pdbData && pdbData.success && pdbData.data?.player?.skin_texture) {
                imageUrl = pdbData.data.player.skin_texture;
                playerName = pdbData.data.player.username || rawInput;

                // Определение модели (classic vs slim) из метаданных профиля Mojang
                const props = pdbData.data.player.properties || [];
                for (const prop of props) {
                  if (prop.name === "textures" && prop.value) {
                    try {
                      const decoded = JSON.parse(atob(prop.value));
                      if (decoded?.textures?.SKIN?.metadata?.model === "slim") {
                        forcedModel = "slim";
                      } else {
                        forcedModel = "classic";
                      }
                    } catch (e) {}
                  }
                }
                foundSkin = true;
              }
            }
          } catch (e) {
            console.warn("PlayerDB fetch failed, fallback to mc-heads/minotar:", e);
          }

          // 2. Резервный источник через MC-Heads / Minotar
          if (!foundSkin) {
            try {
              const headRes = await fetch(`https://mc-heads.net/skin/${encodeURIComponent(rawInput)}`);
              if (headRes.ok) {
                const isValid = headRes.headers.get("x-account-valid");
                if (isValid === "false") {
                  throw new Error(`Лицензионный аккаунт с ником «${rawInput}» не найден.`);
                }
                imageUrl = `https://mc-heads.net/skin/${encodeURIComponent(rawInput)}`;
                playerName = rawInput;
                foundSkin = true;
              }
            } catch (headErr) {
              if (headErr.message && headErr.message.includes("не найден")) throw headErr;
              // Запасной источник Minotar
              imageUrl = `https://minotar.net/skin/${encodeURIComponent(rawInput)}`;
              playerName = rawInput;
            }
          }
        }

        skinUrlBtn.textContent = "Скачиваем скин...";

        // Скачиваем скин и применяем его в 3D сцену
        let blob = null;
        try {
          const res = await fetch(imageUrl);
          if (res.ok) {
            blob = await res.blob();
          }
        } catch (fetchErr) {
          console.warn("Direct fetch failed, fallback to canvas:", fetchErr);
        }

        if (blob) {
          await applySkinBlob(blob, !forcedModel);
        } else {
          // Если fetch блокирован CORS, подгружаем через Image/canvas
          await applySkinBlob(imageUrl, !forcedModel);
        }

        if (forcedModel) {
          await setModel(forcedModel);
        }

        if (playerName) {
          showToast(`Скин игрока ${playerName} загружен!`);
        } else {
          showToast("Скин по ссылке загружен!");
        }
      } catch (err) {
        alert(err.message || "Ошибка загрузки скина. Проверьте правильность ника или ссылки.");
      } finally {
        skinUrlBtn.disabled = false;
        skinUrlBtn.textContent = originalText;
      }
    };

    skinUrlBtn.addEventListener("click", loadSkinFromInput);
    skinUrlInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        e.preventDefault();
        loadSkinFromInput();
      }
    });

    // Переключение ходьбы
    btnWalkToggle.addEventListener("click", () => {
      isWalking = !isWalking;
      btnWalkToggle.classList.toggle("active", isWalking);
      if (viewer) {
        viewer.animation = isWalking ? walkAnimation : null;
      }
    });

    // Сброс камеры / вращения
    btnResetView.addEventListener("click", () => {
      if (viewer) {
        viewer.camera.position.set(0, -5, 70);
        viewer.camera.rotation.set(0, 0, 0);
        viewer.playerWrapper.rotation.set(0, 0, 0);
      }
    });

    // Переключение модели Classic / Slim
    modelBtns.forEach(btn => {
      btn.addEventListener("click", () => setModel(btn.dataset.model));
    });

    // Кнопка генерации ссылки MineSkin
    btnGenerate.addEventListener("click", generateSkinUrl);

    // Копирование команды
    btnCopy.addEventListener("click", async () => {
      const text = resultCode.textContent;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      showToast("Команда скопирована в буфер обмена!");
    });

    // Сохранение в гардероб
    btnSaveSkin.addEventListener("click", saveSkinToWardrobe);
  }

  // Запуск при загрузке страницы
  window.addEventListener("DOMContentLoaded", () => {
    initViewer();
    initCapes();
    bindEvents();
    renderWardrobeInventory();
  });
})();
