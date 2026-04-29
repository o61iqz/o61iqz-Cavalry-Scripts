/**
 * o61_KeyframeCurve
 * 
 * Copyright (c) 2026 o61iqz.
 * Licensed under the MIT License.
 * 
 * Author: o61iqz
 * Version: 1.0.0
 *
 * UI script that applies cubic-bezier curves to selected keyframes.
 * Run from Cavalry's JavaScript Editor or Scripts menu.
 * 
 * Changelog:
 * - Initial release.
 */

(function() {
    var internalPresets = {
        "Ease": [0.25, 0.1, 0.25, 1.0],
        "Ease In": [0.5, 0.0, 1.0, 1.0],
        "Ease Out": [0.0, 0.0, 0.5, 1.0],
        "Ease In Out": [0.5, 0.0, 0.5, 1.0],
        "Linear": [0.0, 0.0, 1.0, 1.0]
    };
    var customPresetNames = [];
    var favoritePresetNames = [];
    var lastUsedPresetName = "";
    var presetStorageFileName = "o61_KeyframeCurve.presets.json";

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function round2Unit(v) {
        return Math.round(clamp(v, 0, 1) * 100) / 100;
    }

    function getPresetStoragePath() {
        if (!ui.scriptLocation) return "";
        return ui.scriptLocation + "/" + presetStorageFileName;
    }

    function loadPersistedPresets() {
        var path = getPresetStoragePath();
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
                lastUsedPresetName = parsed.lastUsedPreset;
            }
            for (var f = 0; f < favorites.length; f++) {
                if (typeof favorites[f] === "string" && favoritePresetNames.indexOf(favorites[f]) < 0) {
                    favoritePresetNames.push(favorites[f]);
                }
            }
            for (var name in presetData) {
                if (!Object.prototype.hasOwnProperty.call(presetData, name)) continue;
                var curve = presetData[name];
                if (!Array.isArray(curve) || curve.length !== 4) continue;
                internalPresets[name] = [
                    round2Unit(curve[0]),
                    round2Unit(curve[1]),
                    round2Unit(curve[2]),
                    round2Unit(curve[3])
                ];
                if (customPresetNames.indexOf(name) < 0) customPresetNames.push(name);
            }
        } catch (err) {
            console.warn("Could not load preset storage: " + err);
        }
    }

    function savePersistedPresets() {
        var path = getPresetStoragePath();
        if (!path) return;
        try {
            if (typeof api.writeToFile !== "function") return;
            var toSave = {
                presets: {},
                favorites: [],
                lastUsedPreset: lastUsedPresetName
            };
            for (var i = 0; i < customPresetNames.length; i++) {
                var name = customPresetNames[i];
                if (internalPresets[name]) toSave.presets[name] = internalPresets[name];
            }
            for (var f = 0; f < favoritePresetNames.length; f++) {
                var favName = favoritePresetNames[f];
                if (internalPresets[favName]) toSave.favorites.push(favName);
            }
            api.writeToFile(path, JSON.stringify(toSave, null, 2), true);
        } catch (err) {
            console.warn("Could not save preset storage: " + err);
        }
    }

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
        return value;
    }

    function asNumber(value) {
        if (typeof value === "number") return value;
        return NaN;
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
            for (var s = 0; s < selectedFrames.length; s++) {
                selectedFrameMap[selectedFrames[s]] = true;
            }

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
                unlockData[parsed.attrId] = {
                    frame: frame,
                    angleLocked: false,
                    weightLocked: false
                };
                api.modifyKeyframeTangent(parsed.layerId, unlockData);

                var currentValue = asNumber(getValueAtFrame(parsed.layerId, parsed.attrId, frame, currentFrame));
                if (isNaN(currentValue)) continue;

                if (index < allFrames.length - 1) {
                    var nextFrame = allFrames[index + 1];
                    var nextValue = asNumber(getValueAtFrame(parsed.layerId, parsed.attrId, nextFrame, currentFrame));
                    if (selectedFrameMap[nextFrame] && !isNaN(nextValue)) {
                        var outX = frame + (nextFrame - frame) * x1;
                        var outY = currentValue + (nextValue - currentValue) * y1;
                        var outData = {};
                        outData[parsed.attrId] = {
                            frame: frame,
                            outHandle: true,
                            angleLocked: false,
                            weightLocked: false,
                            xValue: outX,
                            yValue: outY
                        };
                        api.modifyKeyframeTangent(parsed.layerId, outData);
                    }
                }

                if (index > 0) {
                    var prevFrame = allFrames[index - 1];
                    var prevValue = asNumber(getValueAtFrame(parsed.layerId, parsed.attrId, prevFrame, currentFrame));
                    if (selectedFrameMap[prevFrame] && !isNaN(prevValue)) {
                        var inX = prevFrame + (frame - prevFrame) * x2;
                        var inY = prevValue + (currentValue - prevValue) * y2;
                        var inData = {};
                        inData[parsed.attrId] = {
                            frame: frame,
                            inHandle: true,
                            angleLocked: false,
                            weightLocked: false,
                            xValue: inX,
                            yValue: inY
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

    function repopulatePresetDropDown(dropdown, preferredText) {
        dropdown.clear();
        var keys = Object.keys(internalPresets);
        keys.sort();
        for (var i = 0; i < keys.length; i++) {
            dropdown.addEntry(keys[i]);
        }
        if (preferredText && internalPresets[preferredText]) {
            dropdown.setText(preferredText);
        } else if (keys.length > 0) {
            dropdown.setValue(0);
        }
    }

    function updateFieldsFromCurve(fields, curve) {
        fields.x1.setValue(round2Unit(curve[0]));
        fields.y1.setValue(round2Unit(curve[1]));
        fields.x2.setValue(round2Unit(curve[2]));
        fields.y2.setValue(round2Unit(curve[3]));
    }

    function getCurveFromFields(fields) {
        return [
            round2Unit(fields.x1.getValue()),
            round2Unit(fields.y1.getValue()),
            round2Unit(fields.x2.getValue()),
            round2Unit(fields.y2.getValue())
        ];
    }

    function makeNumericField(defaultValue) {
        var input = new ui.NumericField(defaultValue);
        input.setType(1);
        input.setStep(0.01);
        return input;
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

    function createPresetPreviewDraw(curve, name) {
        var size = 58;
        var padding = 4;
        var draw = new ui.Draw();
        draw.setSize(size, size);
        draw.setBackgroundColor("#1d1f23");

        var span = size - padding * 2;
        function toPoint(x, y) {
            return {
                x: padding + clamp(x, 0, 1) * span,
                y: padding + clamp(y, 0, 1) * span
            };
        }

        var p0 = toPoint(0, 0);
        var p1 = toPoint(curve[0], curve[1]);
        var p2 = toPoint(curve[2], curve[3]);
        var p3 = toPoint(1, 1);

        var frame = new cavalry.Path();
        frame.addRect(padding, padding, size - padding, size - padding);
        draw.addPath(frame.toObject(), { color: "#454a52", stroke: true, strokeWidth: 1 });

        var guide = new cavalry.Path();
        guide.moveTo(p0.x, p0.y);
        guide.lineTo(p3.x, p3.y);
        draw.addPath(guide.toObject(), { color: "#2f333a", stroke: true, strokeWidth: 1 });

        var handles = new cavalry.Path();
        handles.moveTo(p0.x, p0.y);
        handles.lineTo(p1.x, p1.y);
        handles.moveTo(p3.x, p3.y);
        handles.lineTo(p2.x, p2.y);
        draw.addPath(handles.toObject(), { color: "#657180", stroke: true, strokeWidth: 1 });

        var curvePath = new cavalry.Path();
        curvePath.moveTo(p0.x, p0.y);
        curvePath.cubicTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        draw.addPath(curvePath.toObject(), { color: "#4ffd7a", stroke: true, strokeWidth: 2 });

        var endDots = new cavalry.Path();
        endDots.addEllipse(p0.x, p0.y, 3, 3);
        endDots.addEllipse(p3.x, p3.y, 3, 3);
        draw.addPath(endDots.toObject(), { color: "#9aa4b2" });

        var h1 = new cavalry.Path();
        h1.addEllipse(p1.x, p1.y, 4, 4);
        draw.addPath(h1.toObject(), { color: "#36c9ff" });

        var h2 = new cavalry.Path();
        h2.addEllipse(p2.x, p2.y, 4, 4);
        draw.addPath(h2.toObject(), { color: "#ff8a3d" });

        var starBox = new cavalry.Path();
        starBox.addRect(58, 0, 43, 15);
        draw.addPath(starBox.toObject(), { color: "#15171b" });

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
        draw.addPath(star.toObject(), { color: "#d8d8d8", stroke: !isFavoritePreset(name), strokeWidth: 1 });

        draw.onMousePress = function(position, button) {
            if (button !== "left") return;
            if (position.x >= 43 && position.y <= 15) {
                toggleFavoritePreset(name);
            } else {
                selectLoaderPreset(name);
            }
        };

        draw.onMouseDoubleClick = function(position, button) {
            if (button !== "left") return;
            selectLoaderPreset(name);
            rememberLastUsedPreset(name);
            applyCurveToSelection(curve);
        };

        return draw;
    }

    function isCustomPreset(name) {
        return customPresetNames.indexOf(name) >= 0;
    }

    function isFavoritePreset(name) {
        return favoritePresetNames.indexOf(name) >= 0;
    }

    var pendingLoaderRebuild = false;
    var loaderRebuildTimer = null;

    function flushLoaderRebuild() {
        pendingLoaderRebuild = false;
        if (loaderRebuildTimer && typeof loaderRebuildTimer.stop === "function") {
            loaderRebuildTimer.stop();
        }
        savePersistedPresets();
        rebuildLoaderGrid();
    }

    function scheduleLoaderRebuild() {
        if (pendingLoaderRebuild) return;
        pendingLoaderRebuild = true;
        if (typeof api.Timer !== "function") {
            flushLoaderRebuild();
            return;
        }
        if (!loaderRebuildTimer) {
            function RebuildTimerCallbacks() {
                this.onTimeout = flushLoaderRebuild;
            }
            loaderRebuildTimer = new api.Timer(new RebuildTimerCallbacks());
            loaderRebuildTimer.setRepeating(false);
            loaderRebuildTimer.setInterval(1);
        }
        loaderRebuildTimer.start();
    }

    function toggleFavoritePreset(name) {
        if (!name || !internalPresets[name]) return;
        var index = favoritePresetNames.indexOf(name);
        if (index >= 0) {
            favoritePresetNames.splice(index, 1);
        } else {
            favoritePresetNames.push(name);
        }
        scheduleLoaderRebuild();
    }

    function makeSectionHeader(text) {
        var label = new ui.Label(text);
        label.setFontSize(10);
        label.setTextColor("#b8c0cc");
        return label;
    }

    function makePresetCard(name, curve) {
        var card = new ui.Container();
        card.setBackgroundColor("#23262c");
        card.setContentsMargins(1, 1, 1, 1);
        card.setSize(66, 80);

        var preview = createPresetPreviewDraw(curve, name);
        var nameLabel = new ui.Label(shortenName(name, 10));
        nameLabel.setTextColor("#e8e8e8");
        nameLabel.setAlignment(1);
        nameLabel.setFontSize(10);
        nameLabel.setToolTip(name);

        var layout = new ui.VLayout();
        layout.setSpaceBetween(0);
        layout.add(preview);
        layout.add(nameLabel);
        card.setLayout(layout);

        card.onMousePress = function(position, button) {
            if (button === "left") selectLoaderPreset(name);
        };

        card.onMouseDoubleClick = function(position, button) {
            if (button === "left") {
                selectLoaderPreset(name);
                applyCurveToSelection(curve);
            }
        };

        return card;
    }

    function rebuildLoaderGrid() {
        loaderCardWidgets = {};
        loaderGrid = new ui.VLayout();
        loaderGrid.setSpaceBetween(1);
        var names = Object.keys(internalPresets);
        names.sort();

        function addSection(title, sectionNames) {
            if (sectionNames.length === 0) return;
            var sectionGrid = new ui.FlowLayout(0, 0);
            sectionGrid.setSpaceBetween(0);
            sectionGrid.setMargins(1, 1, 1, 1);
            loaderGrid.add(makeSectionHeader(title));
            for (var i = 0; i < sectionNames.length; i++) {
                var name = sectionNames[i];
                var card = makePresetCard(name, internalPresets[name]);
                loaderCardWidgets[name] = card;
                sectionGrid.add(card);
            }
            loaderGrid.add(sectionGrid);
        }

        var favoriteNames = [];
        var builtInNames = [];
        var userNames = [];
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            if (isFavoritePreset(name)) {
                favoriteNames.push(name);
            } else if (isCustomPreset(name)) {
                userNames.push(name);
            } else {
                builtInNames.push(name);
            }
        }

        addSection("Favorite", favoriteNames);
        addSection("Built-In", builtInNames);
        addSection("User", userNames);

        if (names.length === 0) {
            loaderGrid.add(makeSectionHeader("No Presets"));
        }

        for (var c = customPresetNames.length - 1; c >= 0; c--) {
            if (!internalPresets[customPresetNames[c]]) customPresetNames.splice(c, 1);
        }
        for (var f = favoritePresetNames.length - 1; f >= 0; f--) {
            if (!internalPresets[favoritePresetNames[f]]) favoritePresetNames.splice(f, 1);
        }

        if (!loaderSelectedPresetName || !internalPresets[loaderSelectedPresetName]) {
            loaderSelectedPresetName = names.length > 0 ? names[0] : "";
        }

        refreshLoaderSelectionUI();

        if (loaderScroll) {
            loaderScroll.setLayout(loaderGrid);
        }
    }

    function refreshLoaderSelectionUI() {
        var names = Object.keys(loaderCardWidgets);
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            var card = loaderCardWidgets[name];
            if (!card) continue;
            if (name === loaderSelectedPresetName) {
                card.setBackgroundColor("#2f3340");
            } else {
                card.setBackgroundColor("#23262c");
            }
        }
    }

    function selectLoaderPreset(name) {
        loaderSelectedPresetName = name;
        refreshLoaderSelectionUI();
    }

    function rememberLastUsedPreset(name) {
        if (!name || !internalPresets[name]) return;
        lastUsedPresetName = name;
        savePersistedPresets();
    }

    function removeLoaderPreset(name) {
        if (!name || !internalPresets[name]) {
            console.warn("Select a preset first.");
            return;
        }
        var customIndex = customPresetNames.indexOf(name);
        if (customIndex < 0) {
            console.warn("Built-in presets cannot be removed.");
            return;
        }
        customPresetNames.splice(customIndex, 1);
        var favoriteIndex = favoritePresetNames.indexOf(name);
        if (favoriteIndex >= 0) favoritePresetNames.splice(favoriteIndex, 1);
        if (lastUsedPresetName === name) lastUsedPresetName = "";
        delete internalPresets[name];
        savePersistedPresets();
        loaderSelectedPresetName = "";
        rebuildLoaderGrid();
        console.log("Removed preset: " + name);
    }

    function loadLoaderPresetIntoEditor(name) {
        if (!name || !internalPresets[name]) return;
        updateFieldsFromCurve(fields, internalPresets[name]);
        curveEditor.syncFromFields();
        if (savePresetInput && typeof savePresetInput.setText === "function") {
            savePresetInput.setText(name);
        }
        selectLoaderPreset(name);
        rememberLastUsedPreset(name);
        if (tabView && typeof tabView.setTab === "function") {
            tabView.setTab(0);
        }
    }

    function makeCurveEditorWidget(fields) {
        var editor = {};
        editor.width = 160;
        editor.height = 160;
        editor.padding = 16;
        editor.handleRadius = 5;
        editor.dragHandle = "";
        editor.isDragging = false;
        editor.isUpdatingFieldsFromDrag = false;
        editor.pendingDragPos = null;
        editor.hasPendingDrag = false;
        editor.dragTimer = null;
        editor.curve = [
            round2Unit(fields.x1.getValue()),
            round2Unit(fields.y1.getValue()),
            round2Unit(fields.x2.getValue()),
            round2Unit(fields.y2.getValue())
        ];
        editor.draw = new ui.Draw();
        editor.draw.setSize(editor.width, editor.height);
        editor.draw.setBackgroundColor("#1d1f23");

        editor.toScreenPoint = function(x, y) {
            var spanX = editor.width - editor.padding * 2;
            var spanY = editor.height - editor.padding * 2;
            return {
                x: editor.padding + x * spanX,
                y: editor.padding + y * spanY
            };
        };

        editor.toUnitPoint = function(x, y) {
            var spanX = editor.width - editor.padding * 2;
            var spanY = editor.height - editor.padding * 2;
            var ux = (x - editor.padding) / spanX;
            var uy = (y - editor.padding) / spanY;
            return {
                x: clamp(ux, 0, 1),
                y: clamp(uy, 0, 1)
            };
        };

        editor.distance = function(a, b) {
            var dx = a.x - b.x;
            var dy = a.y - b.y;
            return Math.sqrt(dx * dx + dy * dy);
        };

        editor.render = function() {
            editor.draw.clearPaths();

            var p0 = editor.toScreenPoint(0, 0);
            var p1 = editor.toScreenPoint(editor.curve[0], editor.curve[1]);
            var p2 = editor.toScreenPoint(editor.curve[2], editor.curve[3]);
            var p3 = editor.toScreenPoint(1, 1);

            var frame = new cavalry.Path();
            frame.addRect(editor.padding, editor.padding, editor.width - editor.padding, editor.height - editor.padding);
            editor.draw.addPath(frame.toObject(), { color: "#454a52", stroke: true, strokeWidth: 1 });

            var guide = new cavalry.Path();
            guide.moveTo(p0.x, p0.y);
            guide.lineTo(p3.x, p3.y);
            editor.draw.addPath(guide.toObject(), { color: "#2f333a", stroke: true, strokeWidth: 1 });

            var handles = new cavalry.Path();
            handles.moveTo(p0.x, p0.y);
            handles.lineTo(p1.x, p1.y);
            handles.moveTo(p3.x, p3.y);
            handles.lineTo(p2.x, p2.y);
            editor.draw.addPath(handles.toObject(), { color: "#657180", stroke: true, strokeWidth: 1 });

            var curvePath = new cavalry.Path();
            curvePath.moveTo(p0.x, p0.y);
            curvePath.cubicTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
            editor.draw.addPath(curvePath.toObject(), { color: "#4ffd7a", stroke: true, strokeWidth: 2 });

            var endDots = new cavalry.Path();
            endDots.addEllipse(p0.x, p0.y, 3, 3);
            endDots.addEllipse(p3.x, p3.y, 3, 3);
            editor.draw.addPath(endDots.toObject(), { color: "#9aa4b2" });

            var h1 = new cavalry.Path();
            h1.addEllipse(p1.x, p1.y, editor.handleRadius, editor.handleRadius);
            editor.draw.addPath(h1.toObject(), { color: "#36c9ff" });

            var h2 = new cavalry.Path();
            h2.addEllipse(p2.x, p2.y, editor.handleRadius, editor.handleRadius);
            editor.draw.addPath(h2.toObject(), { color: "#ff8a3d" });

            editor.draw.redraw();
        };

        editor.syncFromFields = function() {
            editor.curve = [
                round2Unit(fields.x1.getValue()),
                round2Unit(fields.y1.getValue()),
                round2Unit(fields.x2.getValue()),
                round2Unit(fields.y2.getValue())
            ];
            editor.render();
        };

        editor.syncToFields = function() {
            editor.curve[0] = round2Unit(editor.curve[0]);
            editor.curve[1] = round2Unit(editor.curve[1]);
            editor.curve[2] = round2Unit(editor.curve[2]);
            editor.curve[3] = round2Unit(editor.curve[3]);
            editor.isUpdatingFieldsFromDrag = true;
            fields.x1.setValue(editor.curve[0]);
            fields.y1.setValue(editor.curve[1]);
            fields.x2.setValue(editor.curve[2]);
            fields.y2.setValue(editor.curve[3]);
            editor.isUpdatingFieldsFromDrag = false;
        };

        editor.syncDraggedHandleToFields = function() {
            if (!editor.dragHandle) return;
            editor.isUpdatingFieldsFromDrag = true;
            if (editor.dragHandle === "p1") {
                fields.x1.setValue(round2Unit(editor.curve[0]));
                fields.y1.setValue(round2Unit(editor.curve[1]));
            } else if (editor.dragHandle === "p2") {
                fields.x2.setValue(round2Unit(editor.curve[2]));
                fields.y2.setValue(round2Unit(editor.curve[3]));
            }
            editor.isUpdatingFieldsFromDrag = false;
        };

        editor.applyPointerToCurve = function(position) {
            if (!editor.dragHandle) return false;
            var unit = editor.toUnitPoint(position.x, position.y);
            var nx = unit.x;
            var ny = unit.y;
            if (editor.dragHandle === "p1") {
                if (editor.curve[0] === nx && editor.curve[1] === ny) return false;
                editor.curve[0] = nx;
                editor.curve[1] = ny;
                return true;
            }
            if (editor.dragHandle === "p2") {
                if (editor.curve[2] === nx && editor.curve[3] === ny) return false;
                editor.curve[2] = nx;
                editor.curve[3] = ny;
                return true;
            }
            return false;
        };

        editor.flushPendingDrag = function() {
            if (!editor.dragHandle || !editor.hasPendingDrag || !editor.pendingDragPos) return;
            var pos = editor.pendingDragPos;
            editor.hasPendingDrag = false;
            if (editor.applyPointerToCurve(pos)) {
                editor.syncDraggedHandleToFields();
                editor.render();
            }
        };

        function DragTimerCallbacks() {
            this.onTimeout = function() {
                editor.flushPendingDrag();
            };
        }

        editor.ensureDragTimer = function() {
            if (editor.dragTimer || typeof api.Timer !== "function") return;
            editor.dragTimer = new api.Timer(new DragTimerCallbacks());
            editor.dragTimer.setRepeating(true);
            editor.dragTimer.setInterval(16);
        };

        editor.startDragTimer = function() {
            editor.ensureDragTimer();
            if (editor.dragTimer) {
                editor.dragTimer.start();
            }
        };

        editor.stopDragTimer = function() {
            if (editor.dragTimer && typeof editor.dragTimer.stop === "function") {
                editor.dragTimer.stop();
            }
        };

        editor.pickHandle = function(position) {
            var p1 = editor.toScreenPoint(editor.curve[0], editor.curve[1]);
            var p2 = editor.toScreenPoint(editor.curve[2], editor.curve[3]);
            var hitRadius = 10;
            var d1 = editor.distance(position, p1);
            var d2 = editor.distance(position, p2);
            if (d1 <= hitRadius || d2 <= hitRadius) {
                editor.dragHandle = d1 <= d2 ? "p1" : "p2";
            } else {
                editor.dragHandle = "";
            }
        };

        editor.draw.onMousePress = function(position, button) {
            if (button !== "left") return;
            editor.pickHandle(position);
            if (!editor.dragHandle) return;
            editor.isDragging = true;
            ui.setCallbacksActive(false);
            editor.startDragTimer();
            if (editor.applyPointerToCurve(position)) {
                editor.syncDraggedHandleToFields();
                editor.render();
            }
            editor.pendingDragPos = position;
            editor.hasPendingDrag = false;
        };
        editor.draw.onMouseMove = function(position) {
            if (!editor.dragHandle) return;
            editor.pendingDragPos = position;
            editor.hasPendingDrag = true;
            if (!editor.dragTimer) {
                editor.flushPendingDrag();
            }
        };
        editor.draw.onMouseRelease = function() {
            editor.flushPendingDrag();
            editor.stopDragTimer();
            editor.dragHandle = "";
            editor.isDragging = false;
            ui.setCallbacksActive(true);
            editor.syncToFields();
            editor.render();
            editor.pendingDragPos = null;
            editor.hasPendingDrag = false;
        };

        editor.resize = function(newSize) {
            var clampedSize = Math.max(170, Math.min(400, Math.round(newSize)));
            if (clampedSize === editor.width && clampedSize === editor.height) return;
            editor.width = clampedSize;
            editor.height = clampedSize;
            editor.draw.setSize(editor.width, editor.height);
            editor.render();
        };

        editor.render();
        return editor;
    }

    function getWindowWidth() {
        try {
            if (typeof ui.size === "function") {
                var s = ui.size();
                if (s && typeof s.width === "number") return s.width;
                if (s && typeof s.x === "number") return s.x;
            } else if (ui.size && typeof ui.size.width === "number") {
                return ui.size.width;
            } else if (ui.size && typeof ui.size.x === "number") {
                return ui.size.x;
            }
        } catch (err) { }
        return 360;
    }

    var loaderCardWidgets = {};
    var loaderGrid = null;
    var loaderScroll = null;
    var loaderSelectedPresetName = "";
    var curveEditor = null;
    var tabView = null;

    loadPersistedPresets();

    ui.setTitle("KeyframeCurve");
    ui.setMinimumWidth(240);
    ui.setMinimumHeight(300);
    ui.setMargins(0, 0, 0, 0);

    var x1Label = new ui.Label("x1");
    var y1Label = new ui.Label("y1");
    var x2Label = new ui.Label("x2");
    var y2Label = new ui.Label("y2");
    x1Label.setTextColor("#36c9ff");
    y1Label.setTextColor("#36c9ff");
    x2Label.setTextColor("#ff8a3d");
    y2Label.setTextColor("#ff8a3d");

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
    fields.x1.setFixedHeight(18);
    fields.y1.setFixedHeight(18);
    fields.x2.setFixedHeight(18);
    fields.y2.setFixedHeight(18);

    curveEditor = makeCurveEditorWidget(fields);

    var savePresetInput = new ui.LineEdit();
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

    loaderScroll = new ui.ScrollView();
    loaderScroll.setFixedHeight(300);
    loaderScroll.alwaysShowVerticalScrollBar();
    rebuildLoaderGrid();

    var loaderApplyButton = new ui.Button("Apply");
    loaderApplyButton.onClick = function() {
        if (!loaderSelectedPresetName || !internalPresets[loaderSelectedPresetName]) {
            console.warn("Select a preset first.");
            return;
        }
        rememberLastUsedPreset(loaderSelectedPresetName);
        applyCurveToSelection(internalPresets[loaderSelectedPresetName]);
    };
    loaderApplyButton.setFixedHeight(18);

    var loaderLoadButton = new ui.Button("Load");
    loaderLoadButton.onClick = function() {
        if (!loaderSelectedPresetName || !internalPresets[loaderSelectedPresetName]) {
            console.warn("Select a preset first.");
            return;
        }
        loadLoaderPresetIntoEditor(loaderSelectedPresetName);
    };
    loaderLoadButton.setFixedHeight(18);

    var loaderRemoveButton = new ui.Button("Remove");
    loaderRemoveButton.onClick = function() {
        removeLoaderPreset(loaderSelectedPresetName);
    };
    loaderRemoveButton.setFixedHeight(18);

    var loaderButtonRow = new ui.HLayout();
    loaderButtonRow.setSpaceBetween(5);
    loaderButtonRow.add(loaderApplyButton);
    loaderButtonRow.add(loaderLoadButton);
    loaderButtonRow.add(loaderRemoveButton);

    var loaderLayout = new ui.VLayout();
    loaderLayout.setSpaceBetween(5);
    loaderLayout.add(loaderScroll);
    loaderLayout.add(loaderButtonRow);

    tabView = new ui.TabView();
    tabView.add("Editor", editorLayout);
    tabView.add("Presets", loaderLayout);

    ui.add(tabView);

    if (lastUsedPresetName && internalPresets[lastUsedPresetName]) {
        updateFieldsFromCurve(fields, internalPresets[lastUsedPresetName]);
        curveEditor.syncFromFields();
        if (savePresetInput && typeof savePresetInput.setText === "function") {
            savePresetInput.setText(lastUsedPresetName);
        }
        selectLoaderPreset(lastUsedPresetName);
    }

    function updateLayoutSizes() {
        var size = getWindowSize();
        var graphSize = Math.floor(Math.min(size.width - 12, size.height - 100));
        graphSize = Math.max(170, Math.min(400, graphSize));
        curveEditor.resize(graphSize);
        var loaderHeight = Math.max(80, size.height - 58);
        loaderScroll.setFixedHeight(loaderHeight);
    }

    savePresetButton.onClick = function() {
        var name = savePresetInput.getText().trim();
        if (!name) {
            console.warn("Enter a preset name first.");
            return;
        }
        internalPresets[name] = getCurveFromFields(fields);
        if (customPresetNames.indexOf(name) < 0) customPresetNames.push(name);
        savePersistedPresets();
        rebuildLoaderGrid();
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
