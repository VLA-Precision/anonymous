document.addEventListener("DOMContentLoaded", () => {
  const hydrateVideo = (video) => {
    const source = video.querySelector("source[data-src]");
    if (!source) return;
    source.src = source.dataset.src;
    source.removeAttribute("data-src");
    video.load();
  };

  const carousel = document.querySelector(".carousel");

  if (carousel) {
    const viewport = carousel.querySelector(".carousel__viewport");
    const track = carousel.querySelector(".carousel__track");
    const slides = [...carousel.querySelectorAll(".carousel__slide")];
    const previous = carousel.querySelector(".carousel__button--previous");
    const next = carousel.querySelector(".carousel__button--next");
    const status = carousel.querySelector(".carousel__status");
    const cloneCount = 3;

    const cloneSlide = (slide) => {
      const clone = slide.cloneNode(true);
      clone.classList.add("carousel__slide--clone");
      clone.setAttribute("aria-hidden", "true");
      return clone;
    };

    const leadingClones = slides.slice(-cloneCount).map(cloneSlide);
    const trailingClones = slides.slice(0, cloneCount).map(cloneSlide);
    track.prepend(...leadingClones);
    track.append(...trailingClones);
    const renderedSlides = [...track.querySelectorAll(".carousel__slide")];

    const visibleCount = () => {
      const value = getComputedStyle(track).getPropertyValue("--slides-visible");
      return Number.parseInt(value, 10) || 1;
    };

    const slideStep = () => {
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      return renderedSlides[0].getBoundingClientRect().width + gap;
    };

    const physicalIndex = () => Math.round(viewport.scrollLeft / slideStep());
    const logicalIndex = (index) => ((index - cloneCount) % slides.length + slides.length) % slides.length;

    let targetIndex = cloneCount;
    let queuedOffset = 0;
    let isNavigating = false;
    let scrollTimer;

    const setPosition = (index, instant = false) => {
      if (instant) viewport.classList.add("carousel__viewport--resetting");
      viewport.scrollTo({ left: index * slideStep(), behavior: instant ? "auto" : "smooth" });
      if (instant) {
        window.requestAnimationFrame(() => viewport.classList.remove("carousel__viewport--resetting"));
      }
    };

    const updateStatus = (index = physicalIndex()) => {
      const count = visibleCount();
      const start = logicalIndex(index);
      const labels = Array.from({ length: count }, (_, offset) => ((start + offset) % slides.length) + 1);
      const sequential = labels.every((label, index) => index === 0 || label === labels[index - 1] + 1);
      status.textContent = sequential
        ? `Tasks ${labels[0]}–${labels[labels.length - 1]} of ${slides.length}`
        : `Tasks ${labels.join(", ")} of ${slides.length}`;
    };

    const prepareWindow = (index) => {
      const count = visibleCount();
      for (let offset = 0; offset < count; offset += 1) {
        const video = renderedSlides[index + offset]?.querySelector("video");
        if (!video) continue;
        video.preload = "auto";
        hydrateVideo(video);
      }
    };

    const syncWindowPlayback = (fromIndex, toIndex) => {
      const count = visibleCount();
      for (let offset = 0; offset < count; offset += 1) {
        const sourceVideo = renderedSlides[fromIndex + offset]?.querySelector("video");
        const destinationVideo = renderedSlides[toIndex + offset]?.querySelector("video");
        if (!sourceVideo || !destinationVideo) continue;

        destinationVideo.preload = "auto";
        hydrateVideo(destinationVideo);
        const sync = () => {
          if (Number.isFinite(sourceVideo.currentTime)) {
            try {
              destinationVideo.currentTime = sourceVideo.currentTime;
            } catch (_) {
              // The destination may still be waiting for seekable media data.
            }
          }
          if (!sourceVideo.paused) destinationVideo.play().catch(() => {});
        };

        if (destinationVideo.readyState >= 1) sync();
        else destinationVideo.addEventListener("loadedmetadata", sync, { once: true });
      }
    };

    const normalizeLoop = () => {
      const index = physicalIndex();
      let normalizedIndex = index;
      if (index >= cloneCount + slides.length) normalizedIndex -= slides.length;
      else if (index < cloneCount) normalizedIndex += slides.length;

      if (normalizedIndex !== index) {
        syncWindowPlayback(index, normalizedIndex);
        setPosition(normalizedIndex, true);
      }
      targetIndex = normalizedIndex;
      prepareWindow(targetIndex);
      updateStatus(targetIndex);
    };

    const finishNavigation = () => {
      window.clearTimeout(scrollTimer);
      normalizeLoop();
      isNavigating = false;

      if (queuedOffset !== 0) {
        const nextOffset = Math.sign(queuedOffset);
        queuedOffset -= nextOffset;
        window.requestAnimationFrame(() => goBy(nextOffset));
      }
    };

    const goBy = (offset) => {
      if (isNavigating) {
        queuedOffset += offset;
        return;
      }

      normalizeLoop();
      targetIndex += offset;
      prepareWindow(targetIndex);
      isNavigating = true;
      setPosition(targetIndex);
      updateStatus(targetIndex);
      scrollTimer = window.setTimeout(finishNavigation, 800);
    };

    previous.addEventListener("click", () => goBy(-1));
    next.addEventListener("click", () => goBy(1));

    viewport.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBy(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goBy(1);
      }
    });

    viewport.addEventListener("scroll", () => {
      window.clearTimeout(scrollTimer);
      if (!isNavigating) updateStatus();
      scrollTimer = window.setTimeout(finishNavigation, 180);
    }, { passive: true });

    window.addEventListener("resize", () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        const currentLogicalIndex = logicalIndex(targetIndex);
        targetIndex = cloneCount + currentLogicalIndex;
        setPosition(targetIndex, true);
        prepareWindow(targetIndex);
        updateStatus(targetIndex);
      }, 120);
    });

    setPosition(targetIndex, true);
    prepareWindow(targetIndex);
    updateStatus(targetIndex);
  }

  document.querySelectorAll(".figure-carousel").forEach((figureCarousel) => {
    const viewport = figureCarousel.querySelector(".figure-carousel__viewport");
    const slides = [...figureCarousel.querySelectorAll(".figure-carousel__slide")];
    const previous = figureCarousel.querySelector(".figure-carousel__arrow--previous");
    const next = figureCarousel.querySelector(".figure-carousel__arrow--next");
    const tabs = [...figureCarousel.querySelectorAll("[role='tab']")];
    const status = figureCarousel.querySelector(".figure-carousel__status");
    const isAdaptive = figureCarousel.classList.contains("figure-carousel--adaptive");
    let activeIndex = 0;

    const prepareFigureImage = (image, priority) => {
      image.loading = "eager";
      image.fetchPriority = priority;
      if (typeof image.decode === "function") image.decode().catch(() => {});
    };

    const prepareFigureImages = () => {
      slides.forEach((slide, index) => {
        const image = slide.querySelector("img");
        prepareFigureImage(image, index === activeIndex ? "high" : "low");
      });
    };

    const syncFigureHeight = () => {
      if (!isAdaptive) return;
      window.requestAnimationFrame(() => {
        const height = slides[activeIndex].offsetHeight;
        if (height > 0) viewport.style.height = `${height}px`;
      });
    };

    const updateFigureCarousel = (index) => {
      activeIndex = Math.max(0, Math.min(index, slides.length - 1));
      previous.disabled = activeIndex === 0;
      next.disabled = activeIndex === slides.length - 1;
      tabs.forEach((tab, tabIndex) => {
        const selected = tabIndex === activeIndex;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      status.textContent = `Figure ${activeIndex + 1} of ${slides.length}`;
      syncFigureHeight();
    };

    const goToFigure = (index, behavior = "smooth") => {
      const targetIndex = Math.max(0, Math.min(index, slides.length - 1));
      const targetImage = slides[targetIndex].querySelector("img");
      prepareFigureImage(targetImage, "high");
      viewport.scrollTo({ left: targetIndex * viewport.clientWidth, behavior });
      updateFigureCarousel(targetIndex);
    };

    previous.addEventListener("click", () => goToFigure(activeIndex - 1));
    next.addEventListener("click", () => goToFigure(activeIndex + 1));
    tabs.forEach((tab, index) => tab.addEventListener("click", () => goToFigure(index)));

    viewport.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToFigure(activeIndex - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goToFigure(activeIndex + 1);
      }
    });

    let figureScrollTimer;
    viewport.addEventListener("scroll", () => {
      window.clearTimeout(figureScrollTimer);
      figureScrollTimer = window.setTimeout(() => {
        updateFigureCarousel(Math.round(viewport.scrollLeft / viewport.clientWidth));
      }, 100);
    }, { passive: true });

    if (isAdaptive) {
      slides.forEach((slide) => {
        const image = slide.querySelector("img");
        if (!image.complete) image.addEventListener("load", syncFigureHeight, { once: true });
      });
    }

    if ("IntersectionObserver" in window) {
      const imageObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        prepareFigureImages();
        imageObserver.disconnect();
      }, { rootMargin: "1000px 0px", threshold: 0.01 });
      imageObserver.observe(figureCarousel);
    } else {
      prepareFigureImages();
    }

    window.addEventListener("resize", () => goToFigure(activeIndex, "auto"));
    updateFigureCarousel(0);
  });

  const videos = [...document.querySelectorAll("video")];

  if ("IntersectionObserver" in window) {
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        if (entry.isIntersecting) {
          hydrateVideo(video);
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      });
    }, { rootMargin: "220px 80px", threshold: 0.15 });

    videos.forEach((video) => videoObserver.observe(video));
  } else {
    videos.forEach((video) => {
      hydrateVideo(video);
      video.play().catch(() => {});
    });
  }
});
