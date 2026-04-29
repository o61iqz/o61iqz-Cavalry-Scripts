/**
 * o61_KeyframeCurve
 *
 * Copyright (c) 2026 o61iqz.
 * Licensed under the MIT License.
 *
 * Author: o61iqz
 * Version: 1.0.1
 *
 * UI script that applies cubic-bezier curves to selected keyframes.
 * Run from Cavalry's JavaScript Editor or Scripts menu.
 *
 * Changelog:
 * - Refactored preset persistence and preset browser UI into dedicated manager/view modules.
 * - Split curve editor behavior into CurveEditor and shared drawing helpers.
 * - Added reusable deferred UI rebuild scheduling and reduced loose loader state.
 */

(function() {
    var BUILT_IN_PRESETS = {
        "Ease": [0.25, 0.1, 0.25, 1.0],
        "Ease In": [0.5, 0.0, 1.0, 1.0],
        "Ease Out": [0.0, 0.0, 0.5, 1.0],
        "Ease In Out": [0.5, 0.0, 0.5, 1.0],
        "Linear": [0.0, 0.0, 1.0, 1.0]
    };

    var PRESET_STORAGE_FILE = "o61_KeyframeCurve.presets.json";
    var COLORS = {
        background: "#1d1f23",
        card: "#23262c",
        selectedCard: "#2f3340",
        frame: "#454a52",
        guide: "#2f333a",
        handles: "#657180",
        curve: "#4ffd7a",
        endpoint: "#9aa4b2",
        p1: "#36c9ff",
        p2: "#ff8a3d",
        starBox: "#15171b",
        star: "#d8d8d8",
        text: "#e8e8e8",
        header: "#b8c0cc"
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round2Unit(v) {
        return Math.round(clamp(v, 0, 1) * 100) / 100;
    }

    function copyCurve(curve) {
        return [
            round2Unit(curve[0]),
            round2Unit(curve[1]),
            round2Unit(curve[2]),
            round2Unit(curve[3])
        ];
    }

    function shortenName(text, maxLen) {
        if (!text || text.length <= maxLen) return text;
        if (maxLen <= 3) return text.slice(0, maxLen);
        return text.slice(0, maxLen - 3) + "...";
    }

    function getWindowSize() {
        try {
            if (typeof ui.size === "function") {
                var s = ui.size();
                if (s && typeof s.width === "number" && typeof s.height === "number") {
                    return { width: s.width, height: s.height };
                }
                if (s && typeof s.x === "number" && typeof s.y === "number") {
                    return { width: s.x, height: s.y };
                }
            }
        } catch (err) { }
        return { width: 360, height: 360 };
    }

    function makeNumericField(defaultValue) {
        var input = new ui.NumericField(defaultValue);
        input.setType(1);
        input.setStep(0.01);
        input.setFixedHeight(18);
        return input;
    }

    function getCurveFromFields(fields) {
        return [
            round2Unit(fields.x1.getValue()),
            round2Unit(fields.y1.getValue()),
            round2Unit(fields.x2.getValue()),
            round2Unit(fields.y2.getValue())
        ];
    }

    function updateFieldsFromCurve(fields, curve) {
        fields.x1.setValue(round2Unit(curve[0]));
        fields.y1.setValue(round2Unit(curve[1]));
        fields.x2.setValue(round2Unit(curve[2]));
        fields.y2.setValue(round2Unit(curve[3]));
    }

    function safeSetText(widget, text) {
        if (widget && typeof widget.setText === "function") {
            widget.setText(text);
        }
    }

    function DeferredTask(callback, delayMs) {
        this.callback = callback;
        this.delayMs = delayMs || 1;
        this.pending = false;
        this.timer = null;
    }

    DeferredTask.prototype.run = function() {
        this.pending = false;
        if (this.timer && typeof this.timer.stop === "function") this.timer.stop();
        this.callback();
    };

    DeferredTask.prototype.schedule = function() {
        if (this.pending) return;
        this.pending = true;
        if (typeof api.Timer !== "function") {
            this.run();
            return;
        }
        if (!this.timer) {
            var task = this;
            function TimerCallbacks() {
                this.onTimeout = function() { task.run(); };
            }
            this.timer = new api.Timer(new TimerCallbacks());
            this.timer.setRepeating(false);
            this.timer.setInterval(this.delayMs);
        }
        this.timer.start();
    };

    function PresetsManager(builtIns, storageFileName) {
        this.presets = {};
        this.customNames = [];
        this.favoriteNames = [];
        this.lastUsedName = "";
        this.storageFileName = storageFileName;

        for (var name in builtIns) {
            if (Object.prototype.hasOwnProperty.call(builtIns, name)) {
                this.presets[name] = copyCurve(builtIns[name]);
            }
        }
    }

    PresetsManager.prototype.storagePath = function() {
        if (!ui.scriptLocation) return "";
        return ui.scriptLocation + "/" + this.storageFileName;
    };

    PresetsManager.prototype.load = function() {
        var path = this.storagePath();
        if (!path) return;
        try {
            if (typeof api.readFromFile !== "function") return;
            var text = api.readFromFile(path);
            if (!text) return;
            var parsed = JSON.parse(text);
            if (!parsed || typeof parsed !== "object") return;

            var presetData = parsed.presets && typeof parsed.presets === "object" ? parsed.presets : parsed;
            var favorites = Array.isArray(parsed.favorites) ? parsed.favorites : [];
            if (typeof parsed.lastUsedPreset === "string") {
                this.lastUsedName = parsed.lastUsedPreset;
            }

            for (var f = 0; f < favorites.length; f++) {
                if (typeof favorites[f] === "string" && this.favoriteNames.indexOf(favorites[f]) < 0) {
                    this.favoriteNames.push(favorites[f]);
                }
            }

            for (var name in presetData) {
                if (!Object.prototype.hasOwnProperty.call(presetData, name)) continue;
                var curve = presetData[name];
                if (!Array.isArray(curve) || curve.length !== 4) continue;
                this.presets[name] = copyCurve(curve);
                if (this.customNames.indexOf(name) < 0) this.customNames.push(name);
            }
            this.prune();
        } catch (err) {
            console.warn("Could not load preset storage: " + err);
        }
    };

    PresetsManager.prototype.save = function() {
        var path = this.storagePath();
        if (!path) return;
        try {
            if (typeof api.writeToFile !== "function") return;
            this.prune();
            var data = {
                presets: {},
                favorites: [],
                lastUsedPreset: this.lastUsedName
            };
            for (var i = 0; i < this.customNames.length; i++) {
                var customName = this.customNames[i];
                if (this.presets[customName]) data.presets[customName] = this.presets[customName];
            }
            for (var f = 0; f < this.favoriteNames.length; f++) {
                var favName = this.favoriteNames[f];
                if (this.presets[favName]) data.favorites.push(favName);
            }
            api.writeToFile(path, JSON.stringify(data, null, 2), true);
        } catch (err) {
            console.warn("Could not save preset storage: " + err);
        }
    };

    PresetsManager.prototype.prune = function() {
        for (var i = this.customNames.length - 1; i >= 0; i--) {
            if (!this.presets[this.customNames[i]]) this.customNames.splice(i, 1);
        }
        for (var f = this.favoriteNames.length - 1; f >= 0; f--) {
            if (!this.presets[this.favoriteNames[f]]) this.favoriteNames.splice(f, 1);
        }
        if (this.lastUsedName && !this.presets[this.lastUsedName]) this.lastUsedName = "";
    };

    PresetsManager.prototype.names = function() {
        var names = Object.keys(this.presets);
        names.sort();
        return names;
    };

    PresetsManager.prototype.curve = function(name) {
        return this.presets[name] ? copyCurve(this.presets[name]) : null;
    };

    PresetsManager.prototype.has = function(name) {
        return !!this.presets[name];
    };

    PresetsManager.prototype.isCustom = function(name) {
        return this.customNames.indexOf(name) >= 0;
    };

    PresetsManager.prototype.isFavorite = function(name) {
        return this.favoriteNames.indexOf(name) >= 0;
    };

    PresetsManager.prototype.savePreset = function(name, curve) {
        this.presets[name] = copyCurve(curve);
        if (this.customNames.indexOf(name) < 0) this.customNames.push(name);
        this.save();
    };

    PresetsManager.prototype.remove = function(name) {
        if (!name || !this.presets[name]) {
            console.warn("Select a preset first.");
            return false;
        }
        if (!this.isCustom(name)) {
            console.warn("Built-in presets cannot be removed.");
            return false;
        }
        this.customNames.splice(this.customNames.indexOf(name), 1);
        var favIndex = this.favoriteNames.indexOf(name);
        if (favIndex >= 0) this.favoriteNames.splice(favIndex, 1);
        if (this.lastUsedName === name) this.lastUsedName = "";
        delete this.presets[name];
        this.save();
        console.log("Removed preset: " + name);
        return true;
    };

    PresetsManager.prototype.toggleFavorite = function(name) {
        if (!name || !this.presets[name]) return;
        var index = this.favoriteNames.indexOf(name);
        if (index >= 0) {
            this.favoriteNames.splice(index, 1);
        } else {
            this.favoriteNames.push(name);
        }
    };

    PresetsManager.prototype.remember = function(name) {
        if (!name || !this.presets[name]) return;
        this.lastUsedName = name;
        this.save();
    };

    PresetsManager.prototype.sections = function() {
        var names = this.names();
        var sections = [
            { title: "Favorite", names: [] },
            { title: "Built-In", names: [] },
            { title: "User", names: [] }
        ];
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            if (this.isFavorite(name)) {
                sections[0].names.push(name);
            } else if (this.isCustom(name)) {
                sections[2].names.push(name);
            } else {
                sections[1].names.push(name);
            }
        }
        return sections;
    };

    var CurveDrawing = {
        points: function(curve, size, padding) {
            var span = size - padding * 2;
            function point(x, y) {
                return {
                    x: padding + clamp(x, 0, 1) * span,
                    y: padding + clamp(y, 0, 1) * span
                };
            }
            return {
                p0: point(0, 0),
                p1: point(curve[0], curve[1]),
                p2: point(curve[2], curve[3]),
                p3: point(1, 1)
            };
        },

        drawCurve: function(draw, curve, options) {
            var size = options.size;
            var padding = options.padding;
            var handleRadius = options.handleRadius || 4;
            var pts = this.points(curve, size, padding);

            var frame = new cavalry.Path();
            frame.addRect(padding, padding, size - padding, size - padding);
            draw.addPath(frame.toObject(), { color: COLORS.frame, stroke: true, strokeWidth: 1 });

            var guide = new cavalry.Path();
            guide.moveTo(pts.p0.x, pts.p0.y);
            guide.lineTo(pts.p3.x, pts.p3.y);
            draw.addPath(guide.toObject(), { color: COLORS.guide, stroke: true, strokeWidth: 1 });

            var handles = new cavalry.Path();
            handles.moveTo(pts.p0.x, pts.p0.y);
            handles.lineTo(pts.p1.x, pts.p1.y);
            handles.moveTo(pts.p3.x, pts.p3.y);
            handles.lineTo(pts.p2.x, pts.p2.y);
            draw.addPath(handles.toObject(), { color: COLORS.handles, stroke: true, strokeWidth: 1 });

            var curvePath = new cavalry.Path();
            curvePath.moveTo(pts.p0.x, pts.p0.y);
            curvePath.cubicTo(pts.p1.x, pts.p1.y, pts.p2.x, pts.p2.y, pts.p3.x, pts.p3.y);
            draw.addPath(curvePath.toObject(), { color: COLORS.curve, stroke: true, strokeWidth: 2 });

            var endDots = new cavalry.Path();
            endDots.addEllipse(pts.p0.x, pts.p0.y, 3, 3);
            endDots.addEllipse(pts.p3.x, pts.p3.y, 3, 3);
            draw.addPath(endDots.toObject(), { color: COLORS.endpoint });

            var h1 = new cavalry.Path();
            h1.addEllipse(pts.p1.x, pts.p1.y, handleRadius, handleRadius);
            draw.addPath(h1.toObject(), { color: COLORS.p1 });

            var h2 = new cavalry.Path();
            h2.addEllipse(pts.p2.x, pts.p2.y, handleRadius, handleRadius);
            draw.addPath(h2.toObject(), { color: COLORS.p2 });
        },

        drawFavoriteStar: function(draw, isFavorite) {
            var starBox = new cavalry.Path();
            starBox.addRect(58, 0, 43, 15);
            draw.addPath(starBox.toObject(), { color: COLORS.starBox });

            var star = new cavalry.Path();
            star.moveTo(50.5, 12.5);
            star.lineTo(52.1, 9.3);
            star.lineTo(55.7, 8.8);
            star.lineTo(53.1, 6.3);
            star.lineTo(53.7, 2.7);
            star.lineTo(50.5, 4.4);
            star.lineTo(47.3, 2.7);
            star.lineTo(47.9, 6.3);
            star.lineTo(45.3, 8.8);
            star.lineTo(48.9, 9.3);
            star.lineTo(50.5, 12.5);
            draw.addPath(star.toObject(), { color: COLORS.star, stroke: !isFavorite, strokeWidth: 1 });
        }
    };

    function createPresetPreviewDraw(curve, name, callbacks) {
        var size = 58;
        var draw = new ui.Draw();
        draw.setSize(size, size);
        draw.setBackgroundColor(COLORS.background);
        CurveDrawing.drawCurve(draw, curve, { size: size, padding: 4, handleRadius: 4 });
        CurveDrawing.drawFavoriteStar(draw, callbacks.isFavorite(name));

        draw.onMousePress = function(position, button) {
            if (button !== "left") return;
            if (position.x >= 43 && position.y <= 15) {
                callbacks.onToggleFavorite(name);
                return;
            }
            callbacks.onSelect(name);
        };

        draw.onMouseDoubleClick = function(position, button) {
            if (button !== "left") return;
            callbacks.onApply(name);
        };

        return draw;
    }

    function CurveEditor(fields) {
        this.fields = fields;
        this.width = 160;
        this.height = 160;
        this.padding = 16;
        this.handleRadius = 5;
        this.dragHandle = "";
        this.isUpdatingFieldsFromDrag = false;
        this.pendingDragPos = null;
        this.hasPendingDrag = false;
        this.dragTimer = null;
        this.curve = getCurveFromFields(fields);
        this.draw = new ui.Draw();
        this.draw.setSize(this.width, this.height);
        this.draw.setBackgroundColor(COLORS.background);
        this.bindEvents();
        this.render();
    }

    CurveEditor.prototype.toScreenPoint = function(x, y) {
        var span = this.width - this.padding * 2;
        return {
            x: this.padding + x * span,
            y: this.padding + y * span
        };
    };

    CurveEditor.prototype.toUnitPoint = function(x, y) {
        var span = this.width - this.padding * 2;
        return {
            x: clamp((x - this.padding) / span, 0, 1),
            y: clamp((y - this.padding) / span, 0, 1)
        };
    };

    CurveEditor.prototype.distance = function(a, b) {
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    };

    CurveEditor.prototype.render = function() {
        this.draw.clearPaths();
        CurveDrawing.drawCurve(this.draw, this.curve, {
            size: this.width,
            padding: this.padding,
            handleRadius: this.handleRadius
        });
        this.draw.redraw();
    };

    CurveEditor.prototype.syncFromFields = function() {
        this.curve = getCurveFromFields(this.fields);
        this.render();
    };

    CurveEditor.prototype.syncToFields = function() {
        this.curve = copyCurve(this.curve);
        this.isUpdatingFieldsFromDrag = true;
        updateFieldsFromCurve(this.fields, this.curve);
        this.isUpdatingFieldsFromDrag = false;
    };

    CurveEditor.prototype.syncDraggedHandleToFields = function() {
        if (!this.dragHandle) return;
        this.isUpdatingFieldsFromDrag = true;
        if (this.dragHandle === "p1") {
            this.fields.x1.setValue(round2Unit(this.curve[0]));
            this.fields.y1.setValue(round2Unit(this.curve[1]));
        } else if (this.dragHandle === "p2") {
            this.fields.x2.setValue(round2Unit(this.curve[2]));
            this.fields.y2.setValue(round2Unit(this.curve[3]));
        }
        this.isUpdatingFieldsFromDrag = false;
    };

    CurveEditor.prototype.pickHandle = function(position) {
        var p1 = this.toScreenPoint(this.curve[0], this.curve[1]);
        var p2 = this.toScreenPoint(this.curve[2], this.curve[3]);
        var d1 = this.distance(position, p1);
        var d2 = this.distance(position, p2);
        this.dragHandle = (d1 <= 10 || d2 <= 10) ? (d1 <= d2 ? "p1" : "p2") : "";
    };

    CurveEditor.prototype.applyPointerToCurve = function(position) {
        if (!this.dragHandle) return false;
        var unit = this.toUnitPoint(position.x, position.y);
        if (this.dragHandle === "p1") {
            if (this.curve[0] === unit.x && this.curve[1] === unit.y) return false;
            this.curve[0] = unit.x;
            this.curve[1] = unit.y;
            return true;
        }
        if (this.dragHandle === "p2") {
            if (this.curve[2] === unit.x && this.curve[3] === unit.y) return false;
            this.curve[2] = unit.x;
            this.curve[3] = unit.y;
            return true;
        }
        return false;
    };

    CurveEditor.prototype.flushPendingDrag = function() {
        if (!this.dragHandle || !this.hasPendingDrag || !this.pendingDragPos) return;
        var pos = this.pendingDragPos;
        this.hasPendingDrag = false;
        if (this.applyPointerToCurve(pos)) {
            this.syncDraggedHandleToFields();
            this.render();
        }
    };

    CurveEditor.prototype.ensureDragTimer = function() {
        if (this.dragTimer || typeof api.Timer !== "function") return;
        var editor = this;
        function DragTimerCallbacks() {
            this.onTimeout = function() { editor.flushPendingDrag(); };
        }
        this.dragTimer = new api.Timer(new DragTimerCallbacks());
        this.dragTimer.setRepeating(true);
        this.dragTimer.setInterval(16);
    };

    CurveEditor.prototype.startDragTimer = function() {
        this.ensureDragTimer();
        if (this.dragTimer) this.dragTimer.start();
    };

    CurveEditor.prototype.stopDragTimer = function() {
        if (this.dragTimer && typeof this.dragTimer.stop === "function") this.dragTimer.stop();
    };

    CurveEditor.prototype.bindEvents = function() {
        var editor = this;
        this.draw.onMousePress = function(position, button) {
            if (button !== "left") return;
            editor.pickHandle(position);
            if (!editor.dragHandle) return;
            ui.setCallbacksActive(false);
            editor.startDragTimer();
            if (editor.applyPointerToCurve(position)) {
                editor.syncDraggedHandleToFields();
                editor.render();
            }
            editor.pendingDragPos = position;
            editor.hasPendingDrag = false;
        };

        this.draw.onMouseMove = function(position) {
            if (!editor.dragHandle) return;
            editor.pendingDragPos = position;
            editor.hasPendingDrag = true;
            if (!editor.dragTimer) editor.flushPendingDrag();
        };

        this.draw.onMouseRelease = function() {
            editor.flushPendingDrag();
            editor.stopDragTimer();
            editor.dragHandle = "";
            ui.setCallbacksActive(true);
            editor.syncToFields();
            editor.render();
            editor.pendingDragPos = null;
            editor.hasPendingDrag = false;
        };
    };

    CurveEditor.prototype.resize = function(newSize) {
        var clampedSize = Math.max(170, Math.min(400, Math.round(newSize)));
        if (clampedSize === this.width && clampedSize === this.height) return;
        this.width = clampedSize;
        this.height = clampedSize;
        this.draw.setSize(this.width, this.height);
        this.render();
    };

    function parseSelectedPath(path) {
        var firstDot = path.indexOf(".");
        if (firstDot < 0) return null;
        return {
            layerId: path.substring(0, firstDot),
            attrId: path.substring(firstDot + 1)
        };
    }

    function getValueAtFrame(layerId, attrId, frame, originalFrame) {
        api.setFrame(frame);
        var value = api.get(layerId, attrId);
        api.setFrame(originalFrame);
        return typeof value === "number" ? value : NaN;
    }

    function applyCurveToSelection(curve) {
        var x1 = round2Unit(curve[0]);
        var y1 = round2Unit(curve[1]);
        var x2 = round2Unit(curve[2]);
        var y2 = round2Unit(curve[3]);
        var selected = api.getSelectedKeyframes();
        var totalKeys = 0;
        var totalAttrs = 0;
        var currentFrame = api.getFrame();

        for (var path in selected) {
            if (!Object.prototype.hasOwnProperty.call(selected, path)) continue;
            var parsed = parseSelectedPath(path);
            if (!parsed) continue;
            var selectedFrames = selected[path];
            if (!Array.isArray(selectedFrames) || selectedFrames.length === 0) continue;
            var selectedFrameMap = {};
            for (var s = 0; s < selectedFrames.length; s++) selectedFrameMap[selectedFrames[s]] = true;
            var allFrames = api.getKeyframeTimes(parsed.layerId, parsed.attrId);
            if (!Array.isArray(allFrames) || allFrames.length === 0) continue;
            allFrames.sort(function(a, b) { return a - b; });
            totalAttrs += 1;

            for (var i = 0; i < selectedFrames.length; i++) {
                var frame = selectedFrames[i];
                var index = allFrames.indexOf(frame);
                if (index < 0) continue;

                var keyData = {};
                keyData[parsed.attrId] = { frame: frame, type: 0 };
                api.modifyKeyframe(parsed.layerId, keyData);

                var unlockData = {};
                unlockData[parsed.attrId] = { frame: frame, angleLocked: false, weightLocked: false };
                api.modifyKeyframeTangent(parsed.layerId, unlockData);

                var currentValue = getValueAtFrame(parsed.layerId, parsed.attrId, frame, currentFrame);
                if (isNaN(currentValue)) continue;

                if (index < allFrames.length - 1) {
                    var nextFrame = allFrames[index + 1];
                    var nextValue = getValueAtFrame(parsed.layerId, parsed.attrId, nextFrame, currentFrame);
                    if (selectedFrameMap[nextFrame] && !isNaN(nextValue)) {
                        var outData = {};
                        outData[parsed.attrId] = {
                            frame: frame,
                            outHandle: true,
                            angleLocked: false,
                            weightLocked: false,
                            xValue: frame + (nextFrame - frame) * x1,
                            yValue: currentValue + (nextValue - currentValue) * y1
                        };
                        api.modifyKeyframeTangent(parsed.layerId, outData);
                    }
                }

                if (index > 0) {
                    var prevFrame = allFrames[index - 1];
                    var prevValue = getValueAtFrame(parsed.layerId, parsed.attrId, prevFrame, currentFrame);
                    if (selectedFrameMap[prevFrame] && !isNaN(prevValue)) {
                        var inData = {};
                        inData[parsed.attrId] = {
                            frame: frame,
                            inHandle: true,
                            angleLocked: false,
                            weightLocked: false,
                            xValue: prevFrame + (frame - prevFrame) * x2,
                            yValue: prevValue + (currentValue - prevValue) * y2
                        };
                        api.modifyKeyframeTangent(parsed.layerId, inData);
                    }
                }
                totalKeys += 1;
            }
        }

        api.setFrame(currentFrame);
        if (totalKeys === 0) {
            console.warn("No numeric selected keyframes found.");
        } else {
            console.log("Applied curve to " + totalKeys + " keyframe(s) across " + totalAttrs + " attribute(s).");
        }
    }

    function PresetBrowserView(manager, callbacks) {
        this.manager = manager;
        this.callbacks = callbacks;
        this.cardWidgets = {};
        this.selectedName = "";
        this.grid = null;
        this.scroll = new ui.ScrollView();
        this.scroll.setFixedHeight(300);
        this.scroll.alwaysShowVerticalScrollBar();
        this.rebuild();
    }

    PresetBrowserView.prototype.makeHeader = function(text) {
        var label = new ui.Label(text);
        label.setFontSize(10);
        label.setTextColor(COLORS.header);
        return label;
    };

    PresetBrowserView.prototype.makeCard = function(name) {
        var card = new ui.Container();
        card.setBackgroundColor(COLORS.card);
        card.setContentsMargins(1, 1, 1, 1);
        card.setSize(66, 80);

        var view = this;
        var preview = createPresetPreviewDraw(this.manager.curve(name), name, {
            isFavorite: function(presetName) { return view.manager.isFavorite(presetName); },
            onToggleFavorite: this.callbacks.onToggleFavorite,
            onSelect: function(presetName) { view.select(presetName); },
            onApply: this.callbacks.onApply
        });

        var nameLabel = new ui.Label(shortenName(name, 10));
        nameLabel.setTextColor(COLORS.text);
        nameLabel.setAlignment(1);
        nameLabel.setFontSize(10);
        nameLabel.setToolTip(name);

        var layout = new ui.VLayout();
        layout.setSpaceBetween(0);
        layout.add(preview);
        layout.add(nameLabel);
        card.setLayout(layout);

        card.onMousePress = function(position, button) {
            if (button === "left") view.select(name);
        };
        card.onMouseDoubleClick = function(position, button) {
            if (button === "left") view.callbacks.onApply(name);
        };
        return card;
    };

    PresetBrowserView.prototype.rebuild = function() {
        this.cardWidgets = {};
        this.grid = new ui.VLayout();
        this.grid.setSpaceBetween(1);
        this.manager.prune();

        var sections = this.manager.sections();
        for (var s = 0; s < sections.length; s++) {
            var section = sections[s];
            if (section.names.length === 0) continue;
            var sectionGrid = new ui.FlowLayout(0, 0);
            sectionGrid.setSpaceBetween(0);
            sectionGrid.setMargins(1, 1, 1, 1);
            this.grid.add(this.makeHeader(section.title));
            for (var i = 0; i < section.names.length; i++) {
                var name = section.names[i];
                var card = this.makeCard(name);
                this.cardWidgets[name] = card;
                sectionGrid.add(card);
            }
            this.grid.add(sectionGrid);
        }

        var names = this.manager.names();
        if (names.length === 0) this.grid.add(this.makeHeader("No Presets"));
        if (!this.selectedName || !this.manager.has(this.selectedName)) {
            this.selectedName = names.length > 0 ? names[0] : "";
        }

        this.refreshSelection();
        this.scroll.setLayout(this.grid);
    };

    PresetBrowserView.prototype.refreshSelection = function() {
        var names = Object.keys(this.cardWidgets);
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var card = this.cardWidgets[name];
            if (!card) continue;
            card.setBackgroundColor(name === this.selectedName ? COLORS.selectedCard : COLORS.card);
        }
    };

    PresetBrowserView.prototype.select = function(name) {
        this.selectedName = name;
        this.refreshSelection();
    };

    PresetBrowserView.prototype.selected = function() {
        return this.selectedName;
    };

    PresetBrowserView.prototype.setHeight = function(height) {
        this.scroll.setFixedHeight(height);
    };

    var presetManager = new PresetsManager(BUILT_IN_PRESETS, PRESET_STORAGE_FILE);
    presetManager.load();

    var presetBrowser = null;
    var curveEditor = null;
    var tabView = null;
    var savePresetInput = null;
    var loaderRebuildTask = null;

    function selectLoaderPreset(name) {
        if (presetBrowser) presetBrowser.select(name);
    }

    function rememberLastUsedPreset(name) {
        presetManager.remember(name);
    }

    function toggleFavoritePreset(name) {
        presetManager.toggleFavorite(name);
        if (loaderRebuildTask) loaderRebuildTask.schedule();
    }

    function applyPresetByName(name) {
        var curve = presetManager.curve(name);
        if (!curve) return;
        selectLoaderPreset(name);
        rememberLastUsedPreset(name);
        applyCurveToSelection(curve);
    }

    function loadPresetIntoEditor(name) {
        var curve = presetManager.curve(name);
        if (!curve) {
            console.warn("Select a preset first.");
            return;
        }
        updateFieldsFromCurve(fields, curve);
        curveEditor.syncFromFields();
        safeSetText(savePresetInput, name);
        selectLoaderPreset(name);
        rememberLastUsedPreset(name);
        if (tabView && typeof tabView.setTab === "function") tabView.setTab(0);
    }

    ui.setTitle("KeyframeCurve");
    ui.setMinimumWidth(240);
    ui.setMinimumHeight(300);
    ui.setMargins(0, 0, 0, 0);

    var x1Label = new ui.Label("x1");
    var y1Label = new ui.Label("y1");
    var x2Label = new ui.Label("x2");
    var y2Label = new ui.Label("y2");
    x1Label.setTextColor(COLORS.p1);
    y1Label.setTextColor(COLORS.p1);
    x2Label.setTextColor(COLORS.p2);
    y2Label.setTextColor(COLORS.p2);

    var fields = {
        x1: makeNumericField(0.25),
        y1: makeNumericField(0.1),
        x2: makeNumericField(0.25),
        y2: makeNumericField(1.0)
    };
    fields.x1.setMin(0); fields.x1.setMax(1);
    fields.y1.setMin(0); fields.y1.setMax(1);
    fields.x2.setMin(0); fields.x2.setMax(1);
    fields.y2.setMin(0); fields.y2.setMax(1);

    curveEditor = new CurveEditor(fields);

    savePresetInput = new ui.LineEdit();
    savePresetInput.setPlaceholder("Preset name");
    savePresetInput.setFixedHeight(18);
    var savePresetButton = new ui.Button("Save Preset");
    savePresetButton.setFixedHeight(18);

    var applyButton = new ui.Button("Apply");
    applyButton.setFixedHeight(18);

    var graphRow = new ui.HLayout();
    graphRow.addStretch();
    graphRow.add(curveEditor.draw);
    graphRow.addStretch();

    var coordsRow = new ui.HLayout();
    coordsRow.setSpaceBetween(4);
    coordsRow.add(x1Label);
    coordsRow.add(fields.x1);
    coordsRow.add(y1Label);
    coordsRow.add(fields.y1);
    coordsRow.add(x2Label);
    coordsRow.add(fields.x2);
    coordsRow.add(y2Label);
    coordsRow.add(fields.y2);

    var saveRow = new ui.HLayout();
    saveRow.setSpaceBetween(5);
    saveRow.add(savePresetInput);
    saveRow.add(savePresetButton);

    var editorLayout = new ui.VLayout();
    editorLayout.setSpaceBetween(0);
    editorLayout.add(graphRow);
    editorLayout.add(coordsRow);
    editorLayout.add(saveRow);
    editorLayout.add(applyButton);

    presetBrowser = new PresetBrowserView(presetManager, {
        onToggleFavorite: toggleFavoritePreset,
        onApply: applyPresetByName
    });
    loaderRebuildTask = new DeferredTask(function() {
        presetManager.save();
        presetBrowser.rebuild();
    }, 1);

    var loaderApplyButton = new ui.Button("Apply");
    loaderApplyButton.onClick = function() {
        var selectedName = presetBrowser.selected();
        if (!selectedName || !presetManager.has(selectedName)) {
            console.warn("Select a preset first.");
            return;
        }
        applyPresetByName(selectedName);
    };
    loaderApplyButton.setFixedHeight(18);

    var loaderLoadButton = new ui.Button("Load");
    loaderLoadButton.onClick = function() {
        loadPresetIntoEditor(presetBrowser.selected());
    };
    loaderLoadButton.setFixedHeight(18);

    var loaderRemoveButton = new ui.Button("Remove");
    loaderRemoveButton.onClick = function() {
        if (presetManager.remove(presetBrowser.selected())) {
            presetBrowser.select("");
            presetBrowser.rebuild();
        }
    };
    loaderRemoveButton.setFixedHeight(18);

    var loaderButtonRow = new ui.HLayout();
    loaderButtonRow.setSpaceBetween(5);
    loaderButtonRow.add(loaderApplyButton);
    loaderButtonRow.add(loaderLoadButton);
    loaderButtonRow.add(loaderRemoveButton);

    var loaderLayout = new ui.VLayout();
    loaderLayout.setSpaceBetween(5);
    loaderLayout.add(presetBrowser.scroll);
    loaderLayout.add(loaderButtonRow);

    tabView = new ui.TabView();
    tabView.add("Editor", editorLayout);
    tabView.add("Presets", loaderLayout);

    ui.add(tabView);

    if (presetManager.lastUsedName && presetManager.has(presetManager.lastUsedName)) {
        var lastCurve = presetManager.curve(presetManager.lastUsedName);
        updateFieldsFromCurve(fields, lastCurve);
        curveEditor.syncFromFields();
        safeSetText(savePresetInput, presetManager.lastUsedName);
        selectLoaderPreset(presetManager.lastUsedName);
    }

    function updateLayoutSizes() {
        var size = getWindowSize();
        var graphSize = Math.floor(Math.min(size.width - 12, size.height - 100));
        graphSize = Math.max(170, Math.min(400, graphSize));
        curveEditor.resize(graphSize);
        presetBrowser.setHeight(Math.max(80, size.height - 58));
    }

    savePresetButton.onClick = function() {
        var name = savePresetInput.getText().trim();
        if (!name) {
            console.warn("Enter a preset name first.");
            return;
        }
        presetManager.savePreset(name, getCurveFromFields(fields));
        presetBrowser.rebuild();
        selectLoaderPreset(name);
        console.log("Saved internal preset: " + name);
    };

    applyButton.onClick = function() {
        applyCurveToSelection(getCurveFromFields(fields));
    };

    fields.y1.onValueChanged = function() { if (!curveEditor.isUpdatingFieldsFromDrag) curveEditor.syncFromFields(); };
    fields.x2.onValueChanged = function() { if (!curveEditor.isUpdatingFieldsFromDrag) curveEditor.syncFromFields(); };
    fields.y2.onValueChanged = function() { if (!curveEditor.isUpdatingFieldsFromDrag) curveEditor.syncFromFields(); };
    fields.x1.onValueChanged = function() { if (!curveEditor.isUpdatingFieldsFromDrag) curveEditor.syncFromFields(); };

    ui.onResize = function() {
        updateLayoutSizes();
    };
    ui.show();
    ui.onResize();
})();
