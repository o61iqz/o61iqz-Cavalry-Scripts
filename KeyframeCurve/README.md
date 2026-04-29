# o61_KeyframeCurve for Cavalry

Script by o61iqz

This Cavalry Script UI applies cubic-bezier curves to selected keyframes with an interactive 2D curve preview and preset gallery.

## File

- `o61_KeyframeCurve.js`

## How to install

### JavaScript Editor

1. Open `Window > JavaScript Editor`.
2. Paste the script or load `o61_KeyframeCurve.js`.
3. Click `Run Script`.

### Script UI

1. Open `Scripts > Show Scripts Folder`.
2. Copy `o61_KeyframeCurve.js` to this folder.
3. Run the script from `Scripts > o61_KeyframeCurve`.

## What it does

- Opens a tabbed UI with an `Editor` page and a `Presets` page.
- Provides cubic-bezier controls (`x1`, `y1`, `x2`, `y2`).
- Includes a square 2D curve preview with draggable bezier handles.
- Reads selected keyframes with `api.getSelectedKeyframes()`.
- Converts each selected key to Bezier (`type: 0`).
- Unlocks selected keyframe bezier handles before applying the curve.
- Sets only the handles for segments between selected keyframes, so unselected neighboring segments are not changed.
- Includes built-in presets and user presets saved to `o61_KeyframeCurve.presets.json`.
- Groups presets into `Favorite`, `Built-In`, and `User` sections.
- Lets presets be favorited with the star overlay on each preset preview.

## How to use

- Use the `Editor` tab to adjust the current curve.
- Adjust numeric fields for `x1`, `y1`, `x2`, `y2`.
- Or drag the two handles in the preview to edit the curve visually.
- Enter a preset name and click `Save Preset` to store the current curve as a user preset.
- Click `Apply` on the editor page to apply the current curve to selected keyframes.
- Use the `Presets` tab to browse preset cards.
- Click a preset card to select it.
- Double-click a preset card to apply it to selected keyframes.
- Click the star overlay in the lower-right of a preset preview to move it into or out of `Favorite`.
- Click `Load` to load the selected preset into the editor without applying it.
- Click `Apply` to apply the selected preset to selected keyframes.
- Click `Remove` to delete the selected user preset. Built-in presets cannot be removed.

## Known issues

- Interactive 2D curve preview stutters when dragging the handle. This does not happen if dragging on the numeric fields instead.

## Notes

- This is a JavaScript Editor / Script UI script (uses `api.*`), not a JavaScript Layer plugin.
- It only affects selected keyframes on numeric attributes.
- Preset favorites and user presets are saved next to the script in `o61_KeyframeCurve.presets.json`.

## License

MIT License

Copyright (c) 2026 o61iqz.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
