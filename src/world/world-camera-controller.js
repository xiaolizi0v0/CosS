(function exposeWorldCameraController(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CossWorldCameraController = api;
})(typeof window !== "undefined" ? window : globalThis, function createWorldCameraControllerApi() {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  class WorldCameraController {
    constructor(scene, callbacks = {}) {
      this.scene = scene;
      this.camera = scene.cameras.main;
      this.callbacks = callbacks;
      this.drag = null;
      this.lastDragMoved = false;
      this.enabled = true;
      this.target = { x: 0, y: 0 };
      this.cursors = scene.input.keyboard?.createCursorKeys?.() || null;
      this.wasd = scene.input.keyboard?.addKeys?.({ up: "W", down: "S", left: "A", right: "D" }) || null;
      this.syncFromCamera();
      this.camera.startFollow(this.target, true, 1, 1);
    }

    getBounds() {
      const bounds = this.camera.getBounds?.();
      return bounds || {
        x: 0,
        y: 0,
        width: this.scene.map.width * this.scene.map.tileSize,
        height: this.scene.map.height * this.scene.map.tileSize
      };
    }

    clampTarget() {
      const bounds = this.getBounds();
      const viewWidth = this.camera.width / this.camera.zoom;
      const viewHeight = this.camera.height / this.camera.zoom;
      const minX = bounds.x + Math.min(bounds.width, viewWidth) / 2;
      const maxX = bounds.x + bounds.width - Math.min(bounds.width, viewWidth) / 2;
      const minY = bounds.y + Math.min(bounds.height, viewHeight) / 2;
      const maxY = bounds.y + bounds.height - Math.min(bounds.height, viewHeight) / 2;
      this.target.x = clamp(this.target.x, minX, Math.max(minX, maxX));
      this.target.y = clamp(this.target.y, minY, Math.max(minY, maxY));
    }

    syncFromCamera() {
      this.target.x = this.camera.scrollX + this.camera.width / 2;
      this.target.y = this.camera.scrollY + this.camera.height / 2;
      this.clampTarget();
      if (this.enabled) {
        this.camera.startFollow(this.target, true, 1, 1);
        this.camera.centerOn(this.target.x, this.target.y);
      }
    }

    enableFromCamera() {
      this.enabled = true;
      this.syncFromCamera();
    }

    disable() {
      this.enabled = false;
      this.drag = null;
      this.camera.stopFollow();
    }

    setTarget(x, y, immediate = true) {
      const previousX = this.target.x;
      const previousY = this.target.y;
      this.target.x = Number(x) || 0;
      this.target.y = Number(y) || 0;
      this.clampTarget();
      if (immediate) this.camera.centerOn(this.target.x, this.target.y);
      if (previousX !== this.target.x || previousY !== this.target.y) {
        this.callbacks.onChange?.(this.getState());
      }
    }

    beginDrag(pointer) {
      if (!this.enabled || !pointer.leftButtonDown()) return;
      this.lastDragMoved = false;
      this.drag = {
        x: pointer.x,
        y: pointer.y,
        targetX: this.target.x,
        targetY: this.target.y,
        moved: false
      };
    }

    moveDrag(pointer) {
      if (!this.enabled || !this.drag || !pointer.leftButtonDown()) return false;
      const dx = pointer.x - this.drag.x;
      const dy = pointer.y - this.drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.drag.moved = true;
      this.setTarget(
        this.drag.targetX - dx / this.camera.zoom,
        this.drag.targetY - dy / this.camera.zoom
      );
      return this.drag.moved;
    }

    endDrag(pointer) {
      const moved = Boolean(this.drag?.moved || (pointer?.getDistance && pointer.getDistance() > 4));
      this.lastDragMoved = moved;
      this.drag = null;
      return moved;
    }

    wasDragging(pointer) {
      return Boolean(this.drag?.moved || this.lastDragMoved || (pointer?.getDistance && pointer.getDistance() > 4));
    }

    zoomAt(pointer, deltaY) {
      if (!this.enabled) return;
      const previousZoom = this.camera.zoom;
      const nextZoom = Math.round(clamp(previousZoom + (deltaY > 0 ? -0.1 : 0.1), 0.5, 2.5) * 10) / 10;
      if (nextZoom === previousZoom) return;
      const offsetX = pointer.x - this.camera.x - this.camera.width / 2;
      const offsetY = pointer.y - this.camera.y - this.camera.height / 2;
      this.camera.setZoom(nextZoom);
      this.setTarget(
        this.target.x + offsetX * (1 / previousZoom - 1 / nextZoom),
        this.target.y + offsetY * (1 / previousZoom - 1 / nextZoom)
      );
      this.callbacks.onZoom?.(nextZoom);
    }

    update(delta) {
      if (!this.enabled || this.drag || document.querySelector(".modal-backdrop")) return;
      if (document.activeElement?.matches?.("input, textarea, [contenteditable='true']")) return;
      const left = this.cursors?.left?.isDown || this.wasd?.left?.isDown;
      const right = this.cursors?.right?.isDown || this.wasd?.right?.isDown;
      const up = this.cursors?.up?.isDown || this.wasd?.up?.isDown;
      const down = this.cursors?.down?.isDown || this.wasd?.down?.isDown;
      const axisX = Number(Boolean(right)) - Number(Boolean(left));
      const axisY = Number(Boolean(down)) - Number(Boolean(up));
      if (!axisX && !axisY) return;
      const seconds = Math.min(0.05, Math.max(0, (Number(delta) || 0) / 1000));
      const distance = 720 * seconds / this.camera.zoom;
      this.setTarget(this.target.x + axisX * distance, this.target.y + axisY * distance);
    }

    getState() {
      return {
        mode: "camera-follow-target",
        targetX: this.target.x,
        targetY: this.target.y,
        dragging: Boolean(this.drag),
        worldObjectsMoved: false
      };
    }

    destroy() {
      this.disable();
      this.scene = null;
    }
  }

  return Object.freeze({
    WorldCameraController,
    create: (scene, callbacks) => new WorldCameraController(scene, callbacks)
  });
});
