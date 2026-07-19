<template>
  <div
    ref="containerEl"
    class="relative w-full h-full overflow-hidden"
    data-testid="dungeon-canvas"
    :data-room-count="dungeonStore.rooms.size"
    :data-corridor-count="dungeonStore.corridors.size"
    :data-fog-revealed="dungeonStore.fogCells.size"
    :data-fog-mode="dungeonStore.fogMode ? 'true' : 'false'"
    :data-token-count="dungeonStore.tokens.size"
    :data-icon-count="dungeonStore.icons.size"
  >

    <canvas
      ref="canvasEl"
      class="absolute inset-0 cursor-crosshair"
      :style="{ cursor: cursorStyle, touchAction: 'none' }"
      @mousedown="onMouseDown"
      @mousedown.middle.prevent
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @click="onClick"
      @wheel.prevent="onWheel"
      @contextmenu.prevent="draw.cancel"
      @dblclick="onDoubleClick"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    />

    <svg
      class="absolute inset-0 pointer-events-none"
      :width="canvasWidth"
      :height="canvasHeight"
    >
      <defs>

        <filter id="editor-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="cursor-shadow" x="-20%" y="-20%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,.4)" />
        </filter>
        <clipPath v-for="[id, room] in dungeonStore.rooms" :key="`clip-${id}`" :id="`room-clip-${id}`">
          <rect
            v-if="room.shape === 'circle'"
            :x="room.origin_x * cellPx - viewport.offsetX + 1"
            :y="room.origin_y * cellPx - viewport.offsetY + 1"
            :width="room.width * cellPx - 2"
            :height="room.height * cellPx - 2"
            :rx="Math.min(room.width * cellPx, room.height * cellPx) / 2 - 1"
            :ry="Math.min(room.width * cellPx, room.height * cellPx) / 2 - 1"
          />
          <polygon
            v-else-if="room.shape === 'polygon' && room.points?.length"
            :points="room.points.map(p => `${p.x * cellPx - viewport.offsetX},${p.y * cellPx - viewport.offsetY}`).join(' ')"
          />
          <rect
            v-else
            :x="room.origin_x * cellPx - viewport.offsetX + 1"
            :y="room.origin_y * cellPx - viewport.offsetY + 1"
            :width="room.width * cellPx - 2"
            :height="room.height * cellPx - 2"
          />
        </clipPath>
        <clipPath id="token-clip">
          <circle cx="0" cy="0" :r="tokenR - 1.5" />
        </clipPath>
      </defs>
      <g v-for="[id, room] in dungeonStore.rooms" :key="id" data-testid="dungeon-room">
        <template v-if="true">
          <template v-for="(r, ri) in [resizeGhost && id === resizeRoomId ? resizeGhost : moveGhost && id === moveRoomId ? moveGhost : room]" :key="ri">
            <text
              v-if="room.label"
              :x="r.origin_x * cellPx - viewport.offsetX + (r.width * cellPx) / 2"
              :y="r.origin_y * cellPx - viewport.offsetY + (r.height * cellPx) / 2 + 4"
              text-anchor="middle"
              class="dungeon-label pointer-events-auto cursor-pointer"
              :fill="labelStyle.name.fill"
              :font-size="labelStyle.name.size"
              :font-family="labelStyle.name.family"
              :font-style="labelStyle.name.italic ? 'italic' : 'normal'"
              :font-weight="labelStyle.name.weight"
              :letter-spacing="labelStyle.name.letterSpacing"
              @dblclick.stop="openAnnotation('room', id)"
            >{{ labelStyle.name.uppercase ? room.label.toUpperCase() : room.label }}</text>
            <text
              :x="r.origin_x * cellPx - viewport.offsetX + (r.width * cellPx) / 2"
              :y="r.origin_y * cellPx - viewport.offsetY + (r.height * cellPx) / 2 + (room.label ? labelStyle.name.size + 10 : 4)"
              text-anchor="middle"
              :fill="labelStyle.dims.fill"
              font-size="10"
              :font-family="labelStyle.dims.family"
              :letter-spacing="labelStyle.dims.letterSpacing"
            >{{ r.width * 5 }} × {{ r.height * 5 }} ft</text>
            <g v-if="prefs.showDungeonItems" :clip-path="`url(#room-clip-${id})`">
              <template v-for="item in (room.items ?? [])" :key="item.id">
                <circle
                  :cx="Math.max(r.origin_x * cellPx - viewport.offsetX, Math.min((r.origin_x + r.width) * cellPx - viewport.offsetX - editorAvatarSize, (draggingItem?.itemId === item.id ? draggingItem.ghostX : item.x) * cellPx - viewport.offsetX - editorAvatarSize / 2)) + editorAvatarSize / 2"
                  :cy="Math.max(r.origin_y * cellPx - viewport.offsetY, Math.min((r.origin_y + r.height) * cellPx - viewport.offsetY - editorAvatarSize, (draggingItem?.itemId === item.id ? draggingItem.ghostY : item.y) * cellPx - viewport.offsetY - editorAvatarSize / 2)) + editorAvatarSize / 2"
                  :r="editorAvatarSize / 2"
                  :fill="stampBg(item.type)"
                  :stroke="stampBorder(item.type)"
                  stroke-width="1.5"
                  style="pointer-events:none"
                />
                <foreignObject
                  :x="Math.max(r.origin_x * cellPx - viewport.offsetX, Math.min((r.origin_x + r.width) * cellPx - viewport.offsetX - editorAvatarSize, (draggingItem?.itemId === item.id ? draggingItem.ghostX : item.x) * cellPx - viewport.offsetX - editorAvatarSize / 2))"
                  :y="Math.max(r.origin_y * cellPx - viewport.offsetY, Math.min((r.origin_y + r.height) * cellPx - viewport.offsetY - editorAvatarSize, (draggingItem?.itemId === item.id ? draggingItem.ghostY : item.y) * cellPx - viewport.offsetY - editorAvatarSize / 2))"
                  :width="editorAvatarSize"
                  :height="editorAvatarSize"
                  class="pointer-events-auto"
                  :style="{ cursor: 'grab' }"
                  @mousedown.stop="onItemMouseDown($event, id, item)"
                >
                  <i
                    xmlns="http://www.w3.org/1999/xhtml"
                    :class="faClassForType(item.type)"
                    :style="{ fontSize: Math.max(10, Math.round(editorAvatarSize * 0.65)) + 'px', color: stampFg(item.type), display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', pointerEvents: 'none' }"
                  />
                </foreignObject>
              </template>
            </g>
          </template>
        </template>
      </g>

      <text
        v-if="(draw.ghost.value?.type === 'room' || draw.ghost.value?.type === 'circle') && draw.ghost.value.w > 0 && draw.ghost.value.h > 0"
        :x="draw.ghost.value.x * cellPx - viewport.offsetX + (draw.ghost.value.w * cellPx) / 2"
        :y="draw.ghost.value.y * cellPx - viewport.offsetY + (draw.ghost.value.h * cellPx) / 2 + 28"
        text-anchor="middle"
        fill="#ede1c7"
        font-size="11"
        font-family="'JetBrains Mono', monospace"
        letter-spacing=".04em"
        style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.9))"
      >{{ draw.ghost.value.w * 5 }} × {{ draw.ghost.value.h * 5 }} ft</text>

      <g v-for="[id, corridor] in dungeonStore.corridors" :key="id" data-testid="dungeon-corridor">
        <text
          v-if="corridor.label"
          :x="corridorMidpoint(corridor).x * cellPx - viewport.offsetX"
          :y="corridorMidpoint(corridor).y * cellPx - viewport.offsetY - 4"
          text-anchor="middle"
          fill="#b0a898"
          font-size="9"
          font-family="'Crimson Text', serif"
        >
          {{ corridor.label }}
        </text>

        <template v-if="dungeonStore.selectedElement?.id === id && corridor.points?.length >= 2">
          <circle
            v-for="(pt, i) in (corridorDragGhost?.id === id ? corridorDragGhost.points : corridor.points)"
            :key="i"
            :cx="pt.x * cellPx - viewport.offsetX"
            :cy="pt.y * cellPx - viewport.offsetY"
            :r="hoveredCorridorPoint === i ? 7 : (i === 0 || i === corridor.points.length - 1 ? 5 : 4)"
            :fill="hoveredCorridorPoint === i ? '#ffcc44' : (i === 0 || i === corridor.points.length - 1 ? styleColors.selectedColor : '#ede1c7')"
            :stroke="styleColors.selectedColor"
            stroke-width="1.5"
            style="pointer-events:none"
          />
        </template>
      </g>

      <g v-if="itemDropCell" style="pointer-events:none">
        <rect
          :x="itemDropCell.cellX * cellPx - viewport.offsetX"
          :y="itemDropCell.cellY * cellPx - viewport.offsetY"
          :width="cellPx"
          :height="cellPx"
          :fill="itemDropCell.allowed ? 'rgba(110,190,90,.18)' : 'rgba(200,60,50,.22)'"
          :stroke="itemDropCell.allowed ? '#6ebe5a' : '#c83c32'"
          stroke-width="1.5"
        />
      </g>
      <g v-if="draggingIcon?.moved" style="pointer-events:none">
        <rect
          :x="Math.floor(draggingIcon.ghostX) * cellPx - viewport.offsetX"
          :y="Math.floor(draggingIcon.ghostY) * cellPx - viewport.offsetY"
          :width="cellPx"
          :height="cellPx"
          :fill="iconDropAllowed ? 'rgba(110,190,90,.18)' : 'rgba(200,60,50,.22)'"
          :stroke="iconDropAllowed ? '#6ebe5a' : '#c83c32'"
          stroke-width="1.5"
        />
      </g>
      <g
        v-for="ic in iconModels"
        :key="ic.id"
        data-testid="dungeon-icon"
        :transform="iconTransform(ic)"
      >
        <circle
          v-if="dungeonStore.selectedElement?.type === 'icon' && dungeonStore.selectedElement.id === ic.id"
          cx="0" cy="0" :r="iconR + 4"
          fill="none"
          :stroke="styleColors.selectedColor"
          stroke-width="2"
          stroke-dasharray="5 3"
          style="pointer-events:none"
        />
        <circle
          cx="0" cy="0" :r="iconR"
          :fill="stampBg(ic.type)"
          :stroke="stampBorder(ic.type)"
          stroke-width="1.5"
          style="pointer-events:none"
        />
        <foreignObject
          :x="-iconR" :y="-iconR"
          :width="iconR * 2" :height="iconR * 2"
          :class="tokensInteractive ? 'pointer-events-auto' : ''"
          :style="{ cursor: 'grab' }"
          @mousedown.stop="onIconMouseDown($event, ic)"
        >
          <i
            xmlns="http://www.w3.org/1999/xhtml"
            :class="faClassForType(ic.type)"
            :style="{ fontSize: Math.max(10, Math.round(iconR * 1.15)) + 'px', color: stampFg(ic.type), display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', pointerEvents: 'none' }"
          />
        </foreignObject>
        <text
          v-if="ic.label"
          x="0" :y="iconR + 11"
          text-anchor="middle"
          fill="#ede1c7"
          font-size="10"
          font-family="'Crimson Text', serif"
          style="pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.9))"
        >{{ ic.label }}</text>
      </g>

      <g v-if="draggingToken" style="pointer-events:none">
        <rect
          :x="Math.floor(draggingToken.gx) * cellPx - viewport.offsetX"
          :y="Math.floor(draggingToken.gy) * cellPx - viewport.offsetY"
          :width="cellPx"
          :height="cellPx"
          :fill="tokenDropAllowed ? 'rgba(110,190,90,.18)' : 'rgba(200,60,50,.22)'"
          :stroke="tokenDropAllowed ? '#6ebe5a' : '#c83c32'"
          stroke-width="1.5"
        />
      </g>
      <g
        v-for="t in tokenModels"
        :key="t.id"
        data-testid="dungeon-token"
        :data-token-character="t.characterId"
        :transform="tokenTransform(t)"
      >
        <circle
          v-if="dungeonStore.selectedElement?.type === 'token' && dungeonStore.selectedElement.id === t.id"
          cx="0" cy="0" :r="tokenR + 4"
          fill="none"
          :stroke="styleColors.selectedColor"
          stroke-width="2"
          stroke-dasharray="5 3"
          style="pointer-events:none"
        />
        <circle
          cx="0" cy="0" :r="tokenR"
          fill="#141210"
          :stroke="t.color"
          stroke-width="2"
          style="pointer-events:none"
        />
        <image
          v-if="t.imageUrl"
          :href="t.imageUrl"
          :x="-tokenR" :y="-tokenR"
          :width="tokenR * 2" :height="tokenR * 2"
          preserveAspectRatio="xMidYMid slice"
          clip-path="url(#token-clip)"
          style="pointer-events:none"
        />
        <text
          v-else
          x="0" y="0"
          text-anchor="middle"
          dominant-baseline="central"
          fill="#ede1c7"
          :font-size="tokenR"
          font-family="var(--font-ui, sans-serif)"
          font-weight="700"
          style="pointer-events:none"
        >{{ t.name.slice(0, 1).toUpperCase() }}</text>
        <template v-if="t.maxHp > 0">
          <rect
            :x="-tokenR - 0.5" :y="tokenR + 1.5"
            :width="tokenR * 2 + 1" :height="tokenHpH + 1" :rx="(tokenHpH + 1) / 2"
            fill="rgba(0,0,0,.85)"
            stroke="rgba(237,225,199,.55)"
            stroke-width="1"
            style="pointer-events:none"
          />
          <rect
            :x="-tokenR" :y="tokenR + 2"
            :width="Math.max(0, tokenR * 2 * t.hpPct)" :height="tokenHpH" :rx="tokenHpH / 2"
            :fill="t.hpColor"
            style="pointer-events:none"
          />
        </template>
        <g v-if="t.initiative != null" style="pointer-events:none">
          <circle
            :cx="tokenR * 0.9" :cy="-tokenR * 0.9" :r="Math.max(6, tokenR * 0.55)"
            fill="#1a1410"
            :stroke="t.color"
            stroke-width="1.2"
          />
          <text
            :x="tokenR * 0.9" :y="-tokenR * 0.9"
            text-anchor="middle"
            dominant-baseline="central"
            fill="#ede1c7"
            :font-size="Math.max(7, tokenR * 0.6)"
            font-family="'JetBrains Mono', monospace"
          >{{ t.initiative }}</text>
        </g>
        <g
          v-if="t.conditions.length"
          :class="tokensInteractive ? 'pointer-events-auto' : ''"
          @pointerdown.stop="onTokenPointerDown($event, t)"
          @pointerenter="hoveredTokenId = t.id"
          @pointerleave="hoveredTokenId = null"
        >
          <circle
            :cx="-tokenR + tokenCondR"
            :cy="-tokenR - tokenCondR - 2"
            :r="tokenCondR"
            :fill="t.conditions[0].color"
            stroke="#1a1410"
            stroke-width="1"
          />
          <template v-if="t.conditions.length > 1">
            <circle
              :cx="-tokenR + tokenCondR * 2.1"
              :cy="-tokenR - tokenCondR * 2.1 - 2"
              :r="Math.max(4, tokenCondR * 0.9)"
              fill="#c83c32"
              stroke="#1a1410"
              stroke-width="0.8"
            />
            <text
              :x="-tokenR + tokenCondR * 2.1"
              :y="-tokenR - tokenCondR * 2.1 - 2"
              text-anchor="middle"
              dominant-baseline="central"
              fill="#fff5e8"
              :font-size="Math.max(6, tokenCondR * 1.2)"
              font-family="'JetBrains Mono', monospace"
              font-weight="700"
            >{{ t.conditions.length }}</text>
          </template>
        </g>
        <circle
          cx="0" cy="0" :r="tokenR + 2"
          fill="transparent"
          role="img"
          :aria-label="tokenAriaLabel(t)"
          :class="tokensInteractive ? 'pointer-events-auto' : ''"
          :style="{ cursor: t.canDrag ? 'grab' : 'pointer', touchAction: 'none' }"
          @pointerdown.stop="onTokenPointerDown($event, t)"
          @pointermove="onTokenPointerMove"
          @pointerup="onTokenPointerUp"
          @pointercancel="onTokenPointerCancel"
          @pointerenter="hoveredTokenId = t.id"
          @pointerleave="hoveredTokenId = null"
        />
      </g>

      <g v-if="prefs.showCursors">
        <g v-for="[userId, cursor] in remoteCursors" :key="userId" style="pointer-events:none">
          
          <path
            :d="`M${cursorTip(cursor).x + 3} ${cursorTip(cursor).y + 2} l5 14 2-6 6-2z`"
            :fill="cursor.color"
            stroke="#1a1410"
            stroke-width=".8"
            filter="url(#cursor-shadow)"
          />

          <rect
            :x="cursorTip(cursor).x + 14"
            :y="cursorTip(cursor).y + 14"
            :width="cursorLabelWidth(cursor.name)"
            height="17"
            rx="3"
            :fill="cursor.color"
          />
          <text
            :x="cursorTip(cursor).x + 14 + 7"
            :y="cursorTip(cursor).y + 14 + 11.5"
            font-size="11"
            font-family="var(--font-ui, sans-serif)"
            font-weight="600"
            fill="#fff5e8"
            letter-spacing=".02em"
            dominant-baseline="auto"
            style="pointer-events:none"
          >{{ cursor.name }}</text>
        </g>
      </g>

      <g v-for="[roomId, editors] in editingViewers" :key="`editors-${roomId}`">
        <template v-for="(r, ri) in [dungeonStore.rooms.get(roomId)]" :key="ri">
          <template v-if="r">

            <rect
              v-if="r.shape === 'circle'"
              :x="r.origin_x * cellPx - viewport.offsetX - 3"
              :y="r.origin_y * cellPx - viewport.offsetY - 3"
              :width="r.width * cellPx + 6"
              :height="r.height * cellPx + 6"
              :rx="Math.min(r.width * cellPx, r.height * cellPx) / 2 + 3"
              :ry="Math.min(r.width * cellPx, r.height * cellPx) / 2 + 3"
              fill="none"
              :stroke="editorColor(editors[0]?.user_id)"
              stroke-width="2"
              stroke-dasharray="5 3"
              filter="url(#editor-glow)"
            />
            <polygon
              v-else-if="r.shape === 'polygon' && r.points?.length"
              :points="polygonOutsetPoints(r, 3)"
              fill="none"
              :stroke="editorColor(editors[0]?.user_id)"
              stroke-width="2"
              stroke-dasharray="5 3"
              filter="url(#editor-glow)"
            />
            <rect
              v-else
              :x="r.origin_x * cellPx - viewport.offsetX - 3"
              :y="r.origin_y * cellPx - viewport.offsetY - 3"
              :width="r.width * cellPx + 6"
              :height="r.height * cellPx + 6"
              fill="none"
              :stroke="editorColor(editors[0]?.user_id)"
              stroke-width="2"
              stroke-dasharray="5 3"
              filter="url(#editor-glow)"
            />

            <g v-if="editors[0]">
              <rect
                :x="r.origin_x * cellPx - viewport.offsetX"
                :y="r.origin_y * cellPx - viewport.offsetY - 21"
                :width="editorLabelWidth(editors[0].display_name)"
                height="17"
                rx="2"
                :fill="editorColor(editors[0].user_id)"
              />
              <text
                :x="r.origin_x * cellPx - viewport.offsetX + 5"
                :y="r.origin_y * cellPx - viewport.offsetY - 8"
                fill="#fff5e8"
                font-family="var(--font-ui, sans-serif)"
                font-size="10.5"
                font-weight="600"
                letter-spacing=".02em"
                dominant-baseline="auto"
                style="pointer-events:none"
              >{{ editors[0].display_name }} editing…</text>
            </g>
          </template>
        </template>
      </g>
    </svg>

    <div class="absolute bottom-4 left-4 flex items-end gap-3 pointer-events-none select-none" style="z-index:14">
      <div style="display:flex;align-items:center;padding:4px 8px;background:rgba(13,10,7,.88);border:1px solid rgba(237,225,199,.2);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.5)">
        <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:rgba(237,225,199,.75);letter-spacing:.04em">{{ Math.round(viewport.zoom * 100) }}%</span>
      </div>

      <div style="display:flex;flex-direction:column;align-items:center;padding:6px 10px;background:rgba(13,10,7,.88);border:1px solid rgba(237,225,199,.2);border-radius:4px;gap:4px;box-shadow:0 2px 8px rgba(0,0,0,.5)">
        <div style="position:relative;height:4px;" :style="{ width: Math.min(Math.round(cellPx * 2), 100) + 'px', border:'1px solid rgba(237,225,199,.65)' }">
          <div style="position:absolute;left:50%;top:-3px;width:1px;height:10px;background:rgba(237,225,199,.65)" />
        </div>
        <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:rgba(237,225,199,.75);letter-spacing:.04em">10 ft</span>
      </div>

      <div style="display:flex;align-items:center;justify-content:center;padding:5px;background:rgba(13,10,7,.88);border:1px solid rgba(237,225,199,.2);border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.5)">
        <svg width="38" height="38" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(237,225,199,.25)" stroke-width="1"/>
          <circle cx="24" cy="24" r="17" fill="none" stroke="rgba(237,225,199,.15)" stroke-width=".5" stroke-dasharray="1 3"/>
          <path d="M24 6 L27 24 L24 22 L21 24 Z" fill="#8a1c1c" stroke="rgba(237,225,199,.3)" stroke-width=".5"/>
          <path d="M24 42 L21 24 L24 26 L27 24 Z" fill="rgba(237,225,199,.35)" stroke="rgba(237,225,199,.3)" stroke-width=".5"/>
          <text x="24" y="10" text-anchor="middle" font-family="'IM Fell English',serif" font-size="7" fill="rgba(237,225,199,.75)">N</text>
        </svg>
      </div>
    </div>

    <Transition name="ds-banner">
      <div v-if="statusBanner" class="ds-status-banner">
        <span class="ds-accent-dot" />
        <template v-for="(part, i) in statusBanner" :key="i">
          <kbd v-if="part.type === 'kbd'">{{ part.text }}</kbd>
          <span v-else>{{ part.text }}</span>
        </template>
      </div>
    </Transition>

    <Transition name="ds-banner">
      <div v-if="dungeonStore.drawMode === 'fog' && sessionStore.isGM" class="ds-fog-size-picker">
        <span class="ds-fog-size-label">Brush</span>
        <button
          v-for="opt in FOG_BRUSH_SIZES"
          :key="opt.r"
          :class="['ds-fog-size-btn', fogBrushRadius === opt.r && 'ds-fog-size-btn--active']"
          @click="fogBrushRadius = opt.r"
        >{{ opt.label }}</button>
      </div>
    </Transition>

    <div
      v-if="tokenTooltip"
      class="ds-token-tip"
      data-testid="token-tooltip"
      :style="tokenTooltipStyle"
    >
      <div class="ds-token-tip-name">{{ tokenTooltip.name }}</div>
      <div class="ds-token-tip-stats">
        <span v-if="tokenTooltip.maxHp > 0">HP {{ tokenTooltip.hp }}/{{ tokenTooltip.maxHp }}</span>
        <span v-if="tokenTooltip.ac != null">AC {{ tokenTooltip.ac }}</span>
        <span v-if="tokenTooltip.initiative != null">Init {{ tokenTooltip.initiative }}</span>
      </div>
      <div v-if="tokenTooltip.conditions.length" class="ds-token-tip-conds">
        <span
          v-for="cond in tokenTooltip.conditions"
          :key="cond.name"
          class="ds-token-tip-cond"
          :style="{ '--cond-color': cond.color }"
        ><i :class="cond.faClass" /> {{ cond.name }}</span>
      </div>
    </div>

    <div
      v-if="dimEntry"
      class="ds-dim-input"
      :style="{ left: dimEntry.screenX + 14 + 'px', top: dimEntry.screenY + 14 + 'px' }"
    >
      <input
        v-model="dimW"
        type="number"
        min="1"
        max="999"
        @keydown.enter="submitDim"
        @keydown.escape="dimEntry = null"
      />
      <span>×</span>
      <input
        v-model="dimH"
        type="number"
        min="1"
        max="999"
        @keydown.enter="submitDim"
        @keydown.escape="dimEntry = null"
      />
      <span>squares</span>
      <button class="ds-dim-btn" @click="submitDim">Drop</button>
      <button class="ds-dim-btn ds-dim-ghost" @click="dimEntry = null">Esc</button>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useD } from '@/stores/dungeonStore.js'
import { useAuthStore } from '@/stores/authStore.js'
import { useSessionStore } from '@/stores/sessionStore.js'
import { useDungeonDraw, CELL_SIZE, pixelToGrid, pixelToCell, corridorSegments, tokenStackLayout } from '@/composables/useDungeonDraw.js'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'
import { faClassForType } from '@/lib/roomItems.js'
import { useUserPrefsStore } from '@/stores/userPrefsStore.js'
import { useCharacterStore } from '@/stores/characterStore.js'
import { useStatBlockStore } from '@/stores/statBlockStore.js'
import { useItemDrag } from '@/composables/useItemDrag.js'
import { realtime } from '@/lib/realtime.js'
import { playerColorFor } from '@/composables/usePlayerColor.js'
import { conditionBadge } from '@/lib/conditions.js'
import { tokenImageUrl } from '@/lib/tokenImage.js'

const prefs = useUserPrefsStore()
const sessionStore = useSessionStore()
const mapStyle = computed(() => prefs.mapStyle ?? 'classic')
const styleColors = computed(() => {
  switch (mapStyle.value) {
    case 'parchment':
      return { bg: '#1a0f06', grid: 'rgba(58,46,34,.10)', gridStrong: 'rgba(58,46,34,.22)', floor: '#f4e8cc', wall: '#2a1810', wallW: 2, selectedColor: '#8a1c1c' }
    case 'blueprint':
      return { bg: '#0c2438', grid: 'rgba(255,255,255,.05)', gridStrong: 'rgba(255,255,255,.10)', floor: '#1d4868', wall: '#b8e0f0', wallW: 1.5, selectedColor: '#ffaa55' }
    default:
      return { bg: '#1a1a1a', grid: 'rgba(255,255,255,.04)', gridStrong: 'rgba(255,255,255,.08)', floor: '#ffffff', wall: '#000000', wallW: 2.5, selectedColor: '#d00000' }
  }
})

const labelStyle = computed(() => {
  switch (mapStyle.value) {
    case 'blueprint':
      return {
        name: { family: '"JetBrains Mono",monospace', size: 11, fill: '#f0f6fa', italic: false, weight: '600', uppercase: true, letterSpacing: '.12em' },
        dims: { family: '"JetBrains Mono",monospace', fill: '#8eb6c8', letterSpacing: '.08em' },
      }
    case 'parchment':
      return {
        name: { family: '"IM Fell English",serif', size: 14, fill: '#2a1810', italic: true, weight: '400', uppercase: false, letterSpacing: '.01em' },
        dims: { family: '"JetBrains Mono",monospace', fill: 'rgba(58,46,34,.6)', letterSpacing: '.06em' },
      }
    default:
      return {
        name: { family: '"Special Elite",monospace', size: 12, fill: '#000000', italic: false, weight: '400', uppercase: true, letterSpacing: '.04em' },
        dims: { family: '"JetBrains Mono",monospace', fill: 'rgba(0,0,0,.55)', letterSpacing: '.04em' },
      }
  }
})

const TOOL_HINTS = {
  room:     [{ type: 'text', text: 'Click and drag to draw a room. ' }, { type: 'kbd', text: 'Double-click' }, { type: 'text', text: ' for exact dimensions.' }],
  circle:   [{ type: 'text', text: 'Click and drag to draw a round chamber. ' }, { type: 'kbd', text: 'Double-click' }, { type: 'text', text: ' for exact dimensions.' }],
  polygon:  [{ type: 'text', text: 'Click to place vertices. Double-click or ' }, { type: 'kbd', text: 'Enter' }, { type: 'text', text: ' to close. ' }, { type: 'kbd', text: 'Esc' }, { type: 'text', text: ' to cancel.' }],
  corridor: [{ type: 'text', text: 'Click to place points along the corridor. Double-click to finish. ' }, { type: 'kbd', text: 'Esc' }, { type: 'text', text: ' to cancel.' }],
  door:     [{ type: 'text', text: 'Click a wall to place a door. ' }],
  fog:      [{ type: 'text', text: 'Click or drag to reveal cells. Hold ' }, { type: 'kbd', text: 'Shift' }, { type: 'text', text: ' to hide.' }],
}
const statusBanner = computed(() => TOOL_HINTS[dungeonStore.drawMode] ?? null)

const props = defineProps({
  dungeonId: String,
  mapMoveMode: { type: String, default: 'none' },
  imageSettingsOpen: { type: Boolean, default: false },
})
const emit = defineEmits(['image-offset-change'])

const dungeonStore = useD()
const authStore = useAuthStore()
const characterStore = useCharacterStore()
const statBlockStore = useStatBlockStore()
const { confirm } = useConfirmDialog()

const remoteCursors = ref(new Map())

const dimEntry = ref(null)
const dimW = ref('30')
const dimH = ref('20')

let doorDrag = null
const doorDragGhost = ref(null)
let doorDragMoved = false
let skipNextDoorClick = false

let cursorChannel = null
let cursorRafQueued = false
let pendingCursor = null
let cursorBroadcastVisible = false
let _stopCursorWatch = null

function cursorColorFor(userId) {
  return playerColorFor(userId)
}

function initCursorChannel(dungeonId) {
  if (cursorChannel) realtime.removeChannel(cursorChannel)
  if (_stopCursorWatch) { _stopCursorWatch(); _stopCursorWatch = null }
  cursorChannel = realtime
    .channel(`dungeon:${dungeonId}:cursors`, { sessionId: sessionStore.sessionId })
    .on('broadcast', { event: 'cursor' }, ({ payload }) => {
      if (!payload?.userId || payload.userId === authStore.user?.id) return
      if (payload.hidden) {
        const next = new Map(remoteCursors.value)
        next.delete(payload.userId)
        remoteCursors.value = next
        return
      }
      remoteCursors.value = new Map(remoteCursors.value).set(payload.userId, {
        x: payload.x, y: payload.y,
        name: payload.name,
        color: cursorColorFor(payload.userId),
      })
    })
    .subscribe()

  _stopCursorWatch = watch(() => prefs.showCursors, (visible) => {
    if (!visible) broadcastCursorHidden()
  })
}

function broadcastCursorHidden() {
  pendingCursor = null
  cursorBroadcastVisible = false
  if (!cursorChannel || !authStore.user?.id) return
  cursorChannel.send({ type: 'broadcast', event: 'cursor', payload: { userId: authStore.user.id, hidden: true } })
}

// Tracked on window rather than the canvas so panels and pointer-events-auto
// overlays (labels, door handles) don't swallow moves and flicker the cursor
// for everyone else.
function onCursorTrack(e) {
  if (!prefs.showCursors || !canvasEl.value) return
  const rect = getRect()
  const inside = e.clientX >= rect.left && e.clientX < rect.right
    && e.clientY >= rect.top && e.clientY < rect.bottom
  if (!inside) {
    if (cursorBroadcastVisible) broadcastCursorHidden()
    return
  }
  cursorBroadcastVisible = true
  broadcastCursor(e.clientX - rect.left, e.clientY - rect.top)
}

function onDocumentMouseLeave() {
  if (cursorBroadcastVisible) broadcastCursorHidden()
}

watch(() => dungeonStore.viewers, (viewers) => {
  if (!remoteCursors.value.size) return
  const present = new Set(viewers.map(v => v.user_id).filter(Boolean))
  const next = new Map([...remoteCursors.value].filter(([userId]) => present.has(userId)))
  if (next.size !== remoteCursors.value.size) remoteCursors.value = next
})

function broadcastCursor(canvasX, canvasY) {
  if (!cursorChannel || !authStore.user?.id) return
  const gx = (canvasX + viewport.value.offsetX) / (CELL_SIZE * viewport.value.zoom)
  const gy = (canvasY + viewport.value.offsetY) / (CELL_SIZE * viewport.value.zoom)
  pendingCursor = { userId: authStore.user.id, name: authStore.displayName ?? 'Adventurer', x: gx, y: gy }
  if (!cursorRafQueued) {
    cursorRafQueued = true
    requestAnimationFrame(() => {
      if (pendingCursor && cursorChannel) {
        cursorChannel.send({ type: 'broadcast', event: 'cursor', payload: pendingCursor })
      }
      pendingCursor = null
      cursorRafQueued = false
    })
  }
}


const editingViewers = computed(() => {
  const map = new Map()
  for (const viewer of dungeonStore.viewers) {
    if (!viewer.editing_id || viewer.editing_type !== 'room') continue
    if (viewer.user_id === authStore.user?.id) continue
    if (!dungeonStore.rooms.has(viewer.editing_id)) continue
    const list = map.get(viewer.editing_id) ?? []
    list.push(viewer)
    map.set(viewer.editing_id, list)
  }
  return map
})

const editorAvatarSize = computed(() => Math.max(16, Math.min(36, Math.round(cellPx.value))))

const STAMP_KIND_COLORS = {
  monster:  { bg: '#f5e4d4', border: '#1a1410', fg: '#6b3a2a' },
  treasure: { bg: '#f5ecc4', border: '#b89c2a', fg: '#b89c2a' },
  trap:     { bg: '#f5d4d4', border: '#8a1c1c', fg: '#8a1c1c' },
  feature:  { bg: '#e4ecd4', border: '#5a6b3a', fg: '#5a6b3a' },
  npc:      { bg: '#dce8f0', border: '#2c5266', fg: '#2c5266' },
  secret:   { bg: '#ecdce8', border: '#6b3a5a', fg: '#6b3a5a' },
  body:     { bg: '#e8e0d4', border: '#1a1410', fg: '#3a2e22' },
  key:      { bg: '#f5ecc4', border: '#b89c2a', fg: '#8a6a10' },
}
function stampBg(type)     { return STAMP_KIND_COLORS[type]?.bg     ?? '#ede1c7' }
function stampBorder(type) { return STAMP_KIND_COLORS[type]?.border ?? '#1a1410' }
function stampFg(type)     { return STAMP_KIND_COLORS[type]?.fg     ?? '#1a1410' }

function corridorMidpoint(c) {
  const pts = c.points?.length >= 2 ? c.points : [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }]
  let totalLen = 0
  const segLens = []
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i+1].x - pts[i].x, pts[i+1].y - pts[i].y)
    segLens.push(d)
    totalLen += d
  }
  let remaining = totalLen / 2
  for (let i = 0; i < segLens.length; i++) {
    if (remaining <= segLens[i]) {
      const t = remaining / segLens[i]
      return { x: pts[i].x + t * (pts[i+1].x - pts[i].x), y: pts[i].y + t * (pts[i+1].y - pts[i].y) }
    }
    remaining -= segLens[i]
  }
  return pts[Math.floor(pts.length / 2)]
}

function editorColor(userId) {
  return playerColorFor(userId)
}

function editorLabelWidth(displayName) {
  const text = (displayName ?? '') + ' editing…'
  return text.length * 6.3 + 10
}

function polygonOutsetPoints(room, offset) {
  const cs = cellPx.value
  const pts = room.points
  if (!pts?.length) return ''
  const n = pts.length
  return pts.map((p, i) => {
    const prev = pts[(i + n - 1) % n]
    const next = pts[(i + 1) % n]
    const ax = p.x - prev.x, ay = p.y - prev.y
    const bx = next.x - p.x, by = next.y - p.y
    const la = Math.hypot(ax, ay) || 1
    const lb = Math.hypot(bx, by) || 1
    const nx = (-ay / la + -by / lb) / 2
    const ny = (ax / la + bx / lb) / 2
    const nl = Math.hypot(nx, ny) || 1
    const ox = (nx / nl) * offset / cs
    const oy = (ny / nl) * offset / cs
    return `${(p.x + ox) * cs - viewport.value.offsetX},${(p.y + oy) * cs - viewport.value.offsetY}`
  }).join(' ')
}

function cursorTip(cursor) {
  return {
    x: cursor.x * cellPx.value - viewport.value.offsetX,
    y: cursor.y * cellPx.value - viewport.value.offsetY,
  }
}

function cursorLabelWidth(name) {
  return (name ?? '').length * 6.5 + 14
}

const containerEl = ref(null)
const canvasEl = ref(null)
const canvasWidth = ref(800)
const canvasHeight = ref(600)
let ctx = null
let rafId = null

const mapImageEl = new Image()
const mapImageLoaded = ref(false)
watch(() => dungeonStore.dungeonImageUrl, (url) => {
  mapImageLoaded.value = false
  if (!url) return
  mapImageEl.onload = () => { mapImageLoaded.value = true }
  mapImageEl.onerror = () => { mapImageLoaded.value = false }
  mapImageEl.src = url
}, { immediate: true })

let fogBrush = null
let _fogFlushTimer = null
const FOG_BRUSH_SIZES = [{ label: '1×1', r: 0 }, { label: '3×3', r: 1 }, { label: '5×5', r: 2 }]
const fogBrushRadius = ref(0)

const FOG_BRUSH_CURSOR = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
    <line x1="19" y1="2" x2="10" y2="11" stroke="white" stroke-width="3" stroke-linecap="round"/>
    <line x1="19" y1="2" x2="10" y2="11" stroke="#3a2a1a" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="8.5" y1="11.5" x2="11.5" y2="14.5" stroke="white" stroke-width="4.5" stroke-linecap="round"/>
    <line x1="8.5" y1="11.5" x2="11.5" y2="14.5" stroke="#c0a060" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M4 15 Q1 18 2 20 Q5 21 9 18 L11.5 15 L8.5 12 Z" fill="white"/>
    <path d="M4 15 Q1 18 2 20 Q5 21 9 18 L11.5 15 L8.5 12 Z" fill="#8a1c1c"/>
  </svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 20, crosshair`
})()


const viewport = ref({ offsetX: -100, offsetY: -100, zoom: 1 })
const cellPx = computed(() => CELL_SIZE * viewport.value.zoom)

function applyZoom(factor, mx, my) {
  const oldZoom = viewport.value.zoom
  const newZoom = Math.max(0.25, Math.min(4, oldZoom * factor))
  const ratio = newZoom / oldZoom
  viewport.value = {
    offsetX: mx * (ratio - 1) + viewport.value.offsetX * ratio,
    offsetY: my * (ratio - 1) + viewport.value.offsetY * ratio,
    zoom: newZoom,
  }
}

function zoomIn()    { applyZoom(1.25,       canvasWidth.value / 2, canvasHeight.value / 2) }
function zoomOut()   { applyZoom(1 / 1.25,  canvasWidth.value / 2, canvasHeight.value / 2) }
function resetZoom() { viewport.value = { ...viewport.value, zoom: 1 } }

function findFreeSlot(room, desiredX, desiredY, existingItems, step) {
  const m = step * 0.5
  const minX = room.origin_x + m
  const maxX = room.origin_x + room.width  - m
  const minY = room.origin_y + m
  const maxY = room.origin_y + room.height - m


  const labelCx = room.origin_x + room.width  / 2
  const labelCy = room.origin_y + room.height / 2
  const exW = step * 2
  const exH = step * 1.2
  function overlapsLabel(x, y) {
    return !!room.label &&
      Math.abs(x - labelCx) < exW &&
      Math.abs(y - labelCy) < exH
  }

  const candidates = []
  for (let gy = minY; gy <= maxY + 0.001; gy += step) {
    for (let gx = minX; gx <= maxX + 0.001; gx += step) {
      candidates.push({ x: gx, y: gy })
    }
  }

  candidates.sort((a, b) => {
    const aLabel = overlapsLabel(a.x, a.y) ? 1 : 0
    const bLabel = overlapsLabel(b.x, b.y) ? 1 : 0
    if (aLabel !== bLabel) return aLabel - bLabel
    return Math.hypot(a.x - desiredX, a.y - desiredY) - Math.hypot(b.x - desiredX, b.y - desiredY)
  })

  for (const pos of candidates) {
    if (!existingItems.some(item => Math.hypot(item.x - pos.x, item.y - pos.y) < step * 0.9)) {
      return pos
    }
  }
  return { x: desiredX, y: desiredY }
}

function dropItem(type, clientX, clientY) {
  const rect = getRect()
  const mx = clientX - rect.left
  const my = clientY - rect.top
  const { gx, gy } = pixelToGrid(mx, my, viewport.value)

  let roomId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
  let x = gx
  let y = gy

  // in fog mode the grid itself is the map - a drop outside any room lands as
  // a free icon on the cell instead of snapping into the nearest room
  if (!roomId && dungeonStore.fogMode) {
    const cellX = Math.floor(gx)
    const cellY = Math.floor(gy)
    if (!sessionStore.isGM && !dungeonStore.isCellPlaceable(cellX, cellY)) return
    dungeonStore.addIcon(type, cellX, cellY)
    return
  }

  if (!roomId) {
    let minDist = Infinity
    for (const [id, room] of dungeonStore.rooms) {
      const cx = room.origin_x + room.width / 2
      const cy = room.origin_y + room.height / 2
      const dist = Math.hypot(gx - cx, gy - cy)
      if (dist < minDist) { minDist = dist; roomId = id }
    }
    if (roomId) {
      const room = dungeonStore.rooms.get(roomId)
      const m = (editorAvatarSize.value / 2) / cellPx.value
      x = Math.max(room.origin_x + m, Math.min(room.origin_x + room.width  - m, gx))
      y = Math.max(room.origin_y + m, Math.min(room.origin_y + room.height - m, gy))
    }
  }

  if (roomId) {
    const room = dungeonStore.rooms.get(roomId)
    const step = editorAvatarSize.value / cellPx.value
    const free = findFreeSlot(room, x, y, room.items ?? [], step)
    dungeonStore.addRoomItem(roomId, type, free.x, free.y)
  }
}

function addToSelectedRoom(type) {
  const sel = dungeonStore.selectedElement
  if (sel?.type === 'cell') {
    if (!sessionStore.isGM && !dungeonStore.isCellPlaceable(sel.x, sel.y)) return
    dungeonStore.addIcon(type, sel.x, sel.y)
    return
  }
  if (sel?.type !== 'room') return
  const room = dungeonStore.rooms.get(sel.id)
  if (!room) return
  const cx = room.origin_x + room.width / 2
  const cy = room.origin_y + room.height / 2
  const step = editorAvatarSize.value / cellPx.value
  const free = findFreeSlot(room, cx, cy, room.items ?? [], step)
  dungeonStore.addRoomItem(sel.id, type, free.x, free.y)
}

defineExpose({ zoomIn, zoomOut, resetZoom, dropItem, addToSelectedRoom })

let isPanning = false
let panStart = { x: 0, y: 0 }
let panOrigin = { x: 0, y: 0 }

const draw = useDungeonDraw(viewport)
const HANDLE_HIT = 7
const HANDLE_DRAW = 5

const resizeGhost = ref(null)
const hoveredHandle = ref(null)
let isResizing = false
let resizeHandle = null
let resizeRoomId = null
let resizeStartGrid = null
let resizeOriginal = null
let didResize = false

const moveGhost = ref(null)
let isMoving = false
let moveRoomId = null
let moveStartGrid = null
let moveOriginal = null
let didMove = false

const corridorDragGhost = ref(null)
let corridorDrag = null
let didCorridorDrag = false
const hoveredCorridorPoint = ref(-1)

const draggingItem = ref(null)

const draggingIcon = ref(null)

const draggingToken = ref(null)
const hoveredTokenId = ref(null)
const lastPointerType = ref('mouse')

const tokenR = computed(() => cellPx.value * 0.45)
const tokenCondR = computed(() => Math.max(3, tokenR.value * 0.28))
const tokenHpH = computed(() => Math.max(4, tokenR.value * 0.3))

// tokens only take pointer events in modes where grabbing one can't hijack a
// drawing gesture (the fog brush especially - a token would eat brush strokes)
const tokensInteractive = computed(() =>
  ['select', 'edit'].includes(dungeonStore.drawMode)
)

// the character sheet's "drop token" button. lands the token at the viewport
// center; players in fog mode get the nearest revealed cell instead (any
// revealed cell as a last resort - the center of view may be all fog)
watch(() => dungeonStore.tokenDropRequest, (req) => {
  if (!req) return
  dungeonStore.tokenDropRequest = null
  const cs = cellPx.value
  const centerX = Math.floor((viewport.value.offsetX + canvasWidth.value / 2) / cs)
  const centerY = Math.floor((viewport.value.offsetY + canvasHeight.value / 2) / cs)
  let target = null
  if (sessionStore.isGM || dungeonStore.isCellPlaceable(centerX, centerY)) {
    target = { x: centerX, y: centerY }
  } else {
    outer:
    for (let r = 1; r <= 50; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          if (dungeonStore.isCellPlaceable(centerX + dx, centerY + dy)) {
            target = { x: centerX + dx, y: centerY + dy }
            break outer
          }
        }
      }
    }
    if (!target) {
      const first = dungeonStore.fogCells.values().next().value
      if (first) {
        const [x, y] = first.split(':').map(Number)
        target = { x, y }
      }
    }
  }
  if (!target) return
  if (req.statBlockId) dungeonStore.placeStatBlockToken(req.statBlockId, target.x, target.y)
  else dungeonStore.placeToken(req.characterId, target.x, target.y)
})

function hpColorFor(pct) {
  if (pct > 0.5) return '#6ebe5a'
  if (pct > 0.25) return '#e0a83c'
  return '#c83c32'
}

const charactersById = computed(() =>
  new Map(characterStore.characters.map(c => [c.id, c]))
)

const statBlocksById = computed(() =>
  new Map(statBlockStore.blocks.map(b => [b.id, b]))
)

const STAT_BLOCK_TOKEN_COLORS = { monster: '#c83c32', npc: '#5a8ca8' }

// viewport-independent so panning and dragging don't rebuild it - screen
// position is derived per frame in tokenTransform instead
const tokenModels = computed(() => {
  const models = []
  const isGM = sessionStore.isGM
  const myId = authStore.user?.id
  for (const token of dungeonStore.tokens.values()) {
    // players never see a token parked in unrevealed fog - the GM may be
    // staging an ambush
    if (!isGM && dungeonStore.fogMode && !dungeonStore.fogRevealAll &&
        !dungeonStore.isCellRevealed(token.x, token.y)) continue
    if (token.stat_block_id) {
      const block = statBlocksById.value.get(token.stat_block_id)
      const data = block?.data ?? {}
      const maxHp = data.maxHp ?? 0
      const hp = data.currentHp ?? maxHp
      const hpPct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
      models.push({
        id: token.id,
        characterId: null,
        statBlockId: token.stat_block_id,
        x: token.x,
        y: token.y,
        name: data.name || (block?.kind === 'npc' ? 'NPC' : 'Monster'),
        color: STAT_BLOCK_TOKEN_COLORS[block?.kind] ?? STAT_BLOCK_TOKEN_COLORS.monster,
        hp,
        maxHp,
        hpPct,
        hpColor: hpColorFor(hpPct),
        ac: data.ac ?? null,
        initiative: null,
        conditions: [],
        imageUrl: null,
        canDrag: true,
      })
      continue
    }
    const char = charactersById.value.get(token.character_id)
    const data = char?.data ?? {}
    const maxHp = data.maxHitPoints ?? 0
    const hp = data.currentHp ?? maxHp
    const hpPct = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0
    models.push({
      id: token.id,
      characterId: token.character_id,
      statBlockId: null,
      x: token.x,
      y: token.y,
      name: data.name || 'Unknown',
      color: playerColorFor(char?.user_id),
      hp,
      maxHp,
      hpPct,
      hpColor: hpColorFor(hpPct),
      ac: data.armorClass ?? null,
      initiative: data.initiative ?? null,
      conditions: (data.conditions ?? []).map(conditionBadge),
      imageUrl: tokenImageUrl(data.tokenImagePath),
      canDrag: isGM || (char && char.user_id === myId),
    })
  }
  return models
})

const iconR = computed(() => Math.max(8, cellPx.value * 0.32))

// free-placed grid icons (fog-mode annotation layer). same visibility rule as
// tokens: players never see one parked in unrevealed fog - RLS withholds the
// row, this is the defense-in-depth mirror.
const iconModels = computed(() => {
  const models = []
  const isGM = sessionStore.isGM
  for (const icon of dungeonStore.icons.values()) {
    if (!isGM && dungeonStore.fogMode && !dungeonStore.fogRevealAll &&
        !dungeonStore.isCellRevealed(icon.x, icon.y)) continue
    models.push(icon)
  }
  return models
})

function iconTransform(ic) {
  const cs = cellPx.value
  const d = draggingIcon.value
  const gx = d?.id === ic.id && d.moved ? d.ghostX : ic.x + 0.5
  const gy = d?.id === ic.id && d.moved ? d.ghostY : ic.y + 0.5
  return `translate(${gx * cs - viewport.value.offsetX}, ${gy * cs - viewport.value.offsetY})`
}

const iconDropAllowed = computed(() => {
  const d = draggingIcon.value
  if (!d?.moved) return false
  return sessionStore.isGM || dungeonStore.isCellPlaceable(Math.floor(d.ghostX), Math.floor(d.ghostY))
})

const { state: itemDrag } = useItemDrag()

const itemDropCell = computed(() => {
  if (!itemDrag.active || !dungeonStore.fogMode || !canvasEl.value) return null
  const rect = getRect()
  const mx = itemDrag.x - rect.left
  const my = itemDrag.y - rect.top
  if (mx < 0 || my < 0 || mx >= rect.width || my >= rect.height) return null
  const { gx, gy } = pixelToGrid(mx, my, viewport.value)
  if (draw.hitTestRoom(gx, gy, dungeonStore.rooms)) return null
  const cellX = Math.floor(gx)
  const cellY = Math.floor(gy)
  return { cellX, cellY, allowed: sessionStore.isGM || dungeonStore.isCellPlaceable(cellX, cellY) }
})

function onIconMouseDown(e, icon) {
  if (!tokensInteractive.value) return
  draggingIcon.value = {
    id: icon.id,
    ghostX: icon.x + 0.5,
    ghostY: icon.y + 0.5,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
  }
  window.addEventListener('mousemove', onIconDragMove)
  window.addEventListener('mouseup', onIconDragUp)
}

function onIconDragMove(e) {
  const d = draggingIcon.value
  if (!d) return
  if (!d.moved && Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) <= 4) return
  const rect = getRect()
  const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
  draggingIcon.value = { ...d, ghostX: gx, ghostY: gy, moved: true }
}

function onIconDragUp() {
  const d = draggingIcon.value
  draggingIcon.value = null
  window.removeEventListener('mousemove', onIconDragMove)
  window.removeEventListener('mouseup', onIconDragUp)
  if (!d) return
  if (!d.moved) {
    dungeonStore.selectElement('icon', d.id)
    return
  }
  const icon = dungeonStore.icons.get(d.id)
  if (!icon) return
  const cellX = Math.floor(d.ghostX)
  const cellY = Math.floor(d.ghostY)
  if (cellX === icon.x && cellY === icon.y) return
  // snap back when a player drops into fog - the server rejects it anyway
  if (!sessionStore.isGM && !dungeonStore.isCellPlaceable(cellX, cellY)) return
  dungeonStore.updateIcon(d.id, { x: cellX, y: cellY })
}

const tokenStackLayouts = computed(() => tokenStackLayout(tokenModels.value))

// a dragged token leaves its stack and rides the pointer at full size
function tokenLayout(t) {
  const d = draggingToken.value
  if (d?.id === t.id) return { gx: d.gx, gy: d.gy, scale: 1 }
  const stacked = tokenStackLayouts.value.get(t.id) ?? { dx: 0, dy: 0, scale: 1 }
  return { gx: t.x + 0.5 + stacked.dx, gy: t.y + 0.5 + stacked.dy, scale: stacked.scale }
}

function tokenTransform(t) {
  const cs = cellPx.value
  const { gx, gy, scale } = tokenLayout(t)
  const translate = `translate(${gx * cs - viewport.value.offsetX}, ${gy * cs - viewport.value.offsetY})`
  return scale === 1 ? translate : `${translate} scale(${scale})`
}

function tokenAriaLabel(t) {
  const parts = [t.name]
  if (t.maxHp > 0) parts.push(`HP ${t.hp} of ${t.maxHp}`)
  if (t.ac != null) parts.push(`AC ${t.ac}`)
  if (t.initiative != null) parts.push(`initiative ${t.initiative}`)
  if (t.conditions.length) parts.push(t.conditions.map(c => c.name).join(', '))
  return parts.join(', ')
}

// touch has no hover, so a tap-selected token keeps its card up instead
const tokenTooltip = computed(() => {
  if (draggingToken.value) return null
  const selected = dungeonStore.selectedElement
  const id = hoveredTokenId.value ??
    (lastPointerType.value === 'touch' && selected?.type === 'token' ? selected.id : null)
  if (!id) return null
  return tokenModels.value.find(t => t.id === id) ?? null
})

const tokenTooltipStyle = computed(() => {
  const t = tokenTooltip.value
  if (!t) return {}
  const cs = cellPx.value
  const { gx, gy, scale } = tokenLayout(t)
  const cx = gx * cs - viewport.value.offsetX
  const cy = gy * cs - viewport.value.offsetY
  const r = tokenR.value * scale
  // flip below the token when there isn't room above (condition chips can
  // stack the tooltip a few lines tall)
  const below = cy - r < 150
  return {
    left: `${cx}px`,
    top: below ? `${cy + r + 14}px` : `${cy - r - 14}px`,
    transform: below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
  }
})

const tokenDropAllowed = computed(() => {
  const d = draggingToken.value
  if (!d) return false
  return sessionStore.isGM || dungeonStore.isCellPlaceable(Math.floor(d.gx), Math.floor(d.gy))
})

function onTokenPointerDown(e, view) {
  if (!tokensInteractive.value) return
  lastPointerType.value = e.pointerType
  if (!view.canDrag) {
    dungeonStore.selectElement('token', view.id)
    return
  }
  // one drag at a time - a second finger must not steal or corrupt it
  if (draggingToken.value) return
  const token = dungeonStore.tokens.get(view.id)
  if (!token) return
  draggingToken.value = {
    id: view.id,
    pointerId: e.pointerId,
    gx: token.x + 0.5,
    gy: token.y + 0.5,
    startClientX: e.clientX,
    startClientY: e.clientY,
    moved: false,
  }
  e.target.setPointerCapture(e.pointerId)
}

function onTokenPointerMove(e) {
  const d = draggingToken.value
  if (!d || e.pointerId !== d.pointerId) return
  const moved = d.moved || Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) > 4
  if (!moved) return
  const rect = getRect()
  const cs = cellPx.value
  draggingToken.value = {
    ...d,
    gx: (e.clientX - rect.left + viewport.value.offsetX) / cs,
    gy: (e.clientY - rect.top + viewport.value.offsetY) / cs,
    moved: true,
  }
}

function onTokenPointerUp(e) {
  const d = draggingToken.value
  if (!d || e.pointerId !== d.pointerId) return
  draggingToken.value = null
  if (!d.moved) {
    dungeonStore.selectElement('token', d.id)
    return
  }
  const token = dungeonStore.tokens.get(d.id)
  if (!token) return
  const cellX = Math.floor(d.gx)
  const cellY = Math.floor(d.gy)
  if (cellX === token.x && cellY === token.y) return
  // snap back when a player drops into fog - the server rejects it anyway
  if (!sessionStore.isGM && !dungeonStore.isCellPlaceable(cellX, cellY)) return
  dungeonStore.moveToken(d.id, { x: cellX, y: cellY })
}

// a browser-cancelled gesture (palm rejection, tab switch) is not a tap -
// just drop the drag, never select
function onTokenPointerCancel(e) {
  const d = draggingToken.value
  if (!d || e.pointerId !== d.pointerId) return
  draggingToken.value = null
}

function canDeleteToken(id) {
  const token = dungeonStore.tokens.get(id)
  if (!token) return false
  if (token.stat_block_id) return true
  if (sessionStore.isGM) return true
  const char = charactersById.value.get(token.character_id)
  return char?.user_id === authStore.user?.id
}

function onItemMouseDown(_e, roomId, item) {
  draggingItem.value = { roomId, itemId: item.id, ghostX: item.x, ghostY: item.y }
  window.addEventListener('mousemove', onItemMouseMove)
  window.addEventListener('mouseup', onItemMouseUp)
}

function onItemMouseMove(e) {
  if (!draggingItem.value) return
  const rect = getRect()
  const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
  draggingItem.value = { ...draggingItem.value, ghostX: gx, ghostY: gy }
}

function onItemMouseUp(_e) {
  if (!draggingItem.value) return
  const { roomId, itemId, ghostX, ghostY } = draggingItem.value
  const room = dungeonStore.rooms.get(roomId)

  const m = (editorAvatarSize.value / 2) / cellPx.value
  const x = Math.max(room.origin_x + m, Math.min(room.origin_x + room.width  - m, ghostX))
  const y = Math.max(room.origin_y + m, Math.min(room.origin_y + room.height - m, ghostY))
  dungeonStore.updateRoomItem(roomId, itemId, { x, y })

  draggingItem.value = null
  window.removeEventListener('mousemove', onItemMouseMove)
  window.removeEventListener('mouseup', onItemMouseUp)
}

const HANDLE_CURSORS = {
  nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize',
  e: 'e-resize', se: 'se-resize', s: 's-resize',
  sw: 'sw-resize', w: 'w-resize',
}


function getRoomHandles(room) {
  const cs = cellPx.value
  const px = room.origin_x * cs - viewport.value.offsetX
  const py = room.origin_y * cs - viewport.value.offsetY
  const pw = room.width * cs
  const ph = room.height * cs
  return {
    nw: { x: px,        y: py        },
    n:  { x: px + pw/2, y: py        },
    ne: { x: px + pw,   y: py        },
    e:  { x: px + pw,   y: py + ph/2 },
    se: { x: px + pw,   y: py + ph   },
    s:  { x: px + pw/2, y: py + ph   },
    sw: { x: px,        y: py + ph   },
    w:  { x: px,        y: py + ph/2 },
  }
}

function hitTestHandle(mx, my, room) {
  const handles = getRoomHandles(room)
  for (const [name, pos] of Object.entries(handles)) {
    if (Math.abs(mx - pos.x) <= HANDLE_HIT && Math.abs(my - pos.y) <= HANDLE_HIT) return name
  }
  return null
}

function hitTestCorridorPoint(mx, my, corridor) {
  const cs = cellPx.value
  const pts = corridor.points ?? []
  for (let i = 0; i < pts.length; i++) {
    const px = pts[i].x * cs - viewport.value.offsetX
    const py = pts[i].y * cs - viewport.value.offsetY
    if (Math.hypot(mx - px, my - py) <= HANDLE_HIT + 2) return i
  }
  return -1
}

function applyResize(handle, original, startGx, startGy, gx, gy) {
  const dx = gx - startGx
  const dy = gy - startGy
  let { origin_x, origin_y, width, height } = original

  if (handle.includes('e')) width  = Math.max(1, original.width  + dx)
  if (handle.includes('s')) height = Math.max(1, original.height + dy)
  if (handle.includes('w')) {
    const newW = Math.max(1, original.width - dx)
    origin_x = original.origin_x + (original.width - newW)
    width = newW
  }
  if (handle.includes('n')) {
    const newH = Math.max(1, original.height - dy)
    origin_y = original.origin_y + (original.height - newH)
    height = newH
  }

  return { origin_x, origin_y, width, height }
}

const cursorStyle = computed(() => {
  if (props.mapMoveMode === 'image') return isPanning ? 'grabbing' : 'move'
  if (dungeonStore.drawMode === 'fog') return FOG_BRUSH_CURSOR
  if (dungeonStore.drawMode === 'pan') return isPanning ? 'grabbing' : 'grab'
  if (dungeonStore.drawMode === 'edit') {
    if (isMoving || corridorDrag) return 'grabbing'
    if (hoveredHandle.value) return HANDLE_CURSORS[hoveredHandle.value]
    if (dungeonStore.selectedElement?.type === 'room') return 'grab'
    if (dungeonStore.selectedElement?.type === 'corridor') {
      if (hoveredCorridorPoint.value >= 0) return 'move'
      if (hoveredCorridorPoint.value === -2) return 'grab'
    }
    return 'default'
  }
  if (dungeonStore.drawMode === 'select') return 'default'
  if (dungeonStore.drawMode === 'room' || dungeonStore.drawMode === 'circle' || dungeonStore.drawMode === 'polygon') return 'crosshair'
  if (dungeonStore.drawMode === 'corridor') return 'cell'
  if (dungeonStore.drawMode === 'door') return 'crosshair'
  if (dungeonStore.drawMode === 'token') return 'copy'
  return 'default'
})

const DOOR_HIT = 10

function roomPixelBounds(room) {
  const cs = cellPx.value
  return {
    rx: room.origin_x * cs - viewport.value.offsetX,
    ry: room.origin_y * cs - viewport.value.offsetY,
    rw: room.width  * cs,
    rh: room.height * cs,
  }
}

function doorPixelPos(door, room) {
  if (door.x !== undefined) {
    const cs = cellPx.value
    return [door.x * cs - viewport.value.offsetX, door.y * cs - viewport.value.offsetY]
  }
  const { rx, ry, rw, rh } = roomPixelBounds(room)
  return door.wall === 'n' ? [rx + door.offset * rw, ry] :
         door.wall === 's' ? [rx + door.offset * rw, ry + rh] :
         door.wall === 'w' ? [rx, ry + door.offset * rh] :
                             [rx + rw, ry + door.offset * rh]
}

function closestPointOnEllipse(mx, my, room) {
  const cs = cellPx.value
  const cx = (room.origin_x + room.width / 2) * cs - viewport.value.offsetX
  const cy = (room.origin_y + room.height / 2) * cs - viewport.value.offsetY
  const rx = room.width  * cs / 2
  const ry = room.height * cs / 2
  const angle = Math.atan2((my - cy) / ry, (mx - cx) / rx)
  const px = cx + rx * Math.cos(angle)
  const py = cy + ry * Math.sin(angle)
  return { gx: px / cs + viewport.value.offsetX / cs, gy: py / cs + viewport.value.offsetY / cs, px, py }
}

function closestPointOnPolygon(mx, my, points) {
  const cs = cellPx.value
  let bestDist = Infinity, bestPx = 0, bestPy = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const ax = a.x * cs - viewport.value.offsetX, ay = a.y * cs - viewport.value.offsetY
    const bx = b.x * cs - viewport.value.offsetX, by = b.y * cs - viewport.value.offsetY
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((mx - ax) * dx + (my - ay) * dy) / lenSq))
    const nearX = ax + t * dx, nearY = ay + t * dy
    const dist = Math.hypot(mx - nearX, my - nearY)
    if (dist < bestDist) { bestDist = dist; bestPx = nearX; bestPy = nearY }
  }
  return { gx: (bestPx + viewport.value.offsetX) / cs, gy: (bestPy + viewport.value.offsetY) / cs, px: bestPx, py: bestPy, dist: bestDist }
}

function findRoomWall(mx, my) {
  const threshold = DOOR_HIT
  for (const [id, room] of dungeonStore.rooms) {
    if (room.shape === 'rect') {
      const { rx, ry, rw, rh } = roomPixelBounds(room)
      if (Math.abs(my - ry) < threshold && mx > rx && mx < rx + rw)
        return { roomId: id, wall: 'n', offset: (mx - rx) / rw }
      if (Math.abs(my - (ry + rh)) < threshold && mx > rx && mx < rx + rw)
        return { roomId: id, wall: 's', offset: (mx - rx) / rw }
      if (Math.abs(mx - rx) < threshold && my > ry && my < ry + rh)
        return { roomId: id, wall: 'w', offset: (my - ry) / rh }
      if (Math.abs(mx - (rx + rw)) < threshold && my > ry && my < ry + rh)
        return { roomId: id, wall: 'e', offset: (my - ry) / rh }
    } else if (room.shape === 'circle') {
      const { gx, gy, px, py } = closestPointOnEllipse(mx, my, room)
      if (Math.hypot(mx - px, my - py) < threshold)
        return { roomId: id, x: gx, y: gy }
    } else if (room.shape === 'polygon' && room.points?.length >= 3) {
      const { gx, gy, dist } = closestPointOnPolygon(mx, my, room.points)
      if (dist < threshold)
        return { roomId: id, x: gx, y: gy }
    }
  }
  return null
}

function findDoorAtClick(mx, my) {
  for (const [roomId, room] of dungeonStore.rooms) {
    for (const door of (room.doors ?? [])) {
      const [dx, dy] = doorPixelPos(door, room)
      if (Math.hypot(mx - dx, my - dy) < DOOR_HIT)
        return { roomId, doorId: door.id }
    }
  }
  return null
}


function renderFrame() {
  if (!ctx) return
  const W = canvasWidth.value
  const H = canvasHeight.value
  ctx.clearRect(0, 0, W, H)

  drawBackground(W, H)
  drawMapImage()
  drawGrid(W, H)
  drawCorridors()
  drawRooms()
  drawDoors()
  if (draw.ghost.value) drawGhost()
  drawFog()

  rafId = requestAnimationFrame(renderFrame)
}

function drawMapImage() {
  if (!mapImageLoaded.value || !dungeonStore.dungeon?.map_image_path) return
  const d = dungeonStore.dungeon
  const zoom = viewport.value.zoom
  const scale = (d.map_image_scale ?? 1) * zoom
  const imgW = mapImageEl.naturalWidth  * scale
  const imgH = mapImageEl.naturalHeight * scale
  const imgX = (d.map_image_offset_x ?? 0) * zoom - viewport.value.offsetX
  const imgY = (d.map_image_offset_y ?? 0) * zoom - viewport.value.offsetY
  const rot  = d.map_image_rotation ?? 0

  ctx.save()
  if (rot) {
    ctx.translate(imgX + imgW / 2, imgY + imgH / 2)
    ctx.rotate(rot * Math.PI / 180)
    ctx.drawImage(mapImageEl, -imgW / 2, -imgH / 2, imgW, imgH)
  } else {
    ctx.drawImage(mapImageEl, imgX, imgY, imgW, imgH)
  }
  ctx.restore()
}

function drawFog() {
  const d = dungeonStore.dungeon
  if (!d) return
  if (d.fog_reveal_all) return
  if (!d.fog_mode) return

  const cs = cellPx.value
  const colMin = Math.floor(viewport.value.offsetX / cs) - 1
  const rowMin = Math.floor(viewport.value.offsetY / cs) - 1
  const colMax = colMin + Math.ceil(canvasWidth.value / cs) + 2
  const rowMax = rowMin + Math.ceil(canvasHeight.value / cs) + 2

  const isGM = sessionStore.isGM
  ctx.fillStyle = isGM ? 'rgba(8,12,22,0.45)' : '#080c16'

  for (let col = colMin; col <= colMax; col++) {
    for (let row = rowMin; row <= rowMax; row++) {
      if (!dungeonStore.isCellRevealed(col, row)) {
        const px = col * cs - viewport.value.offsetX
        const py = row * cs - viewport.value.offsetY
        ctx.fillRect(px, py, cs, cs)
      }
    }
  }

  if (isGM && d.fog_mode) {
    ctx.strokeStyle = 'rgba(255,200,80,0.25)'
    ctx.lineWidth = 0.5
    for (let col = colMin; col <= colMax; col++) {
      for (let row = rowMin; row <= rowMax; row++) {
        if (dungeonStore.isCellRevealed(col, row)) {
          const px = col * cs - viewport.value.offsetX
          const py = row * cs - viewport.value.offsetY
          ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1)
        }
      }
    }
  }
}

function drawBackground(W, H) {
  switch (mapStyle.value) {
    case 'parchment': {
      ctx.fillStyle = '#1a0f06'
      ctx.fillRect(0, 0, W, H)
      const g1 = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, Math.max(W, H) * 0.65)
      g1.addColorStop(0, 'rgba(184,156,106,.45)'); g1.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H)
      const g2 = ctx.createRadialGradient(W * 0.7, H * 0.8, 0, W * 0.7, H * 0.8, Math.max(W, H) * 0.65)
      g2.addColorStop(0, 'rgba(60,30,10,.55)'); g2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H)
      break
    }
    case 'blueprint': {
      const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.75)
      grad.addColorStop(0, '#1a4664'); grad.addColorStop(1, '#0d2a3a')
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H)
      break
    }
    default: {
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, W, H)
      break
    }
  }
}

function drawGrid(W, H) {
  const cs = cellPx.value
  const sc = styleColors.value
  const sx = -(viewport.value.offsetX % cs)
  const sy = -(viewport.value.offsetY % cs)
  const alignMode = props.imageSettingsOpen
  const hasMapImage = mapImageLoaded.value && dungeonStore.dungeon?.map_image_path

  const gridColor       = alignMode ? 'rgba(255, 210, 60, 0.55)' : hasMapImage ? 'rgba(0,0,0,.35)' : sc.grid
  const gridStrongColor = alignMode ? 'rgba(255, 210, 60, 0.95)' : hasMapImage ? 'rgba(0,0,0,.55)' : sc.gridStrong
  const gridWidth       = alignMode ? 1.0 : hasMapImage ? 1.2 : (mapStyle.value === 'blueprint' ? 0.7 : 0.5)
  const gridStrongWidth = alignMode ? 1.8 : hasMapImage ? 1.7 : (mapStyle.value === 'blueprint' ? 1.0 : 0.8)

  ctx.strokeStyle = gridColor
  ctx.lineWidth = gridWidth
  ctx.beginPath()
  for (let x = sx; x < W; x += cs) { ctx.moveTo(x, 0); ctx.lineTo(x, H) }
  for (let y = sy; y < H; y += cs) { ctx.moveTo(0, y); ctx.lineTo(W, y) }
  ctx.stroke()

  const mcs = cs * 5
  const msx = -(viewport.value.offsetX % mcs)
  const msy = -(viewport.value.offsetY % mcs)
  ctx.strokeStyle = gridStrongColor
  ctx.lineWidth = gridStrongWidth
  ctx.beginPath()
  for (let x = msx; x < W; x += mcs) { ctx.moveTo(x, 0); ctx.lineTo(x, H) }
  for (let y = msy; y < H; y += mcs) { ctx.moveTo(0, y); ctx.lineTo(W, y) }
  ctx.stroke()
}

function drawRooms() {
  const cs = cellPx.value
  const sc = styleColors.value

  for (const [id, room] of dungeonStore.rooms) {
    const isSelected = dungeonStore.selectedElement?.id === id
    const r = (isResizing && id === resizeRoomId && resizeGhost.value) ? resizeGhost.value
            : (isMoving   && id === moveRoomId   && moveGhost.value)   ? moveGhost.value
            : room

    const px = r.origin_x * cs - viewport.value.offsetX
    const py = r.origin_y * cs - viewport.value.offsetY
    const pw = r.width * cs
    const ph = r.height * cs
    const isCircle  = room.shape === 'circle'
    const isPolygon = room.shape === 'polygon'


    const shapePath = () => {
      ctx.beginPath()
      if (isCircle) {
        ctx.roundRect(px, py, pw, ph, Math.min(pw, ph) / 2)
      } else if (isPolygon && r.points?.length >= 3) {
        r.points.forEach((p, i) => {
          const ppx = p.x * cs - viewport.value.offsetX
          const ppy = p.y * cs - viewport.value.offsetY
          if (i === 0) ctx.moveTo(ppx, ppy)
          else ctx.lineTo(ppx, ppy)
        })
        ctx.closePath()
      } else {
        ctx.rect(px, py, pw, ph)
      }
    }

    if (mapStyle.value === 'classic' && !isPolygon) {
      const shadowOffset = isSelected ? 3 : 2
      ctx.fillStyle = isSelected ? '#d00000' : '#000000'
      if (isCircle) {
        ctx.beginPath()
        ctx.roundRect(px + shadowOffset, py + shadowOffset, pw, ph, Math.min(pw, ph) / 2)
        ctx.fill()
      } else {
        ctx.fillRect(px + shadowOffset, py + shadowOffset, pw, ph)
      }
    }


    ctx.save()
    shapePath()
    ctx.clip()

    ctx.fillStyle = sc.floor
    ctx.fill()

    if (mapStyle.value === 'parchment' || mapStyle.value === 'classic') {
      const strength = mapStyle.value === 'parchment' ? 1.0 : 0.5
      const g1 = ctx.createRadialGradient(px + pw * 0.3, py + ph * 0.2, 0, px + pw * 0.3, py + ph * 0.2, Math.max(pw, ph) * 0.85)
      g1.addColorStop(0, `rgba(184,156,106,${0.28 * strength})`); g1.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g1; ctx.fill()
      const g2 = ctx.createRadialGradient(px + pw * 0.8, py + ph * 0.8, 0, px + pw * 0.8, py + ph * 0.8, Math.max(pw, ph) * 0.75)
      g2.addColorStop(0, `rgba(120,80,40,${0.20 * strength})`); g2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g2; ctx.fill()
    }


    const gridColor = mapStyle.value === 'blueprint'
      ? 'rgba(255,255,255,.06)'
      : mapStyle.value === 'classic'
        ? 'rgba(0,0,0,.10)'
        : 'rgba(58,46,34,.10)'
    ctx.strokeStyle = gridColor
    ctx.lineWidth = mapStyle.value === 'blueprint' ? 0.7 : 0.5
    ctx.beginPath()
    for (let x = px; x <= px + pw + 0.5; x += cs) { ctx.moveTo(x, py); ctx.lineTo(x, py + ph) }
    for (let y = py; y <= py + ph + 0.5; y += cs) { ctx.moveTo(px, y); ctx.lineTo(px + pw, y) }
    ctx.stroke()

    ctx.restore()

    const borderW = mapStyle.value === 'blueprint' ? 1.5 : mapStyle.value === 'classic' ? 2.5 : 2
    ctx.strokeStyle = sc.wall
    ctx.lineWidth = borderW
    shapePath()
    ctx.stroke()

    if (isSelected) {
      const outset = 4
      if (mapStyle.value === 'classic') {

        ctx.strokeStyle = sc.selectedColor
        ctx.lineWidth = 3
        shapePath()
        ctx.stroke()
      } else {

        ctx.strokeStyle = sc.selectedColor
        ctx.lineWidth = 2
        ctx.beginPath()
        if (isCircle) {
          ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2 + outset, ph / 2 + outset, 0, 0, Math.PI * 2)
        } else if (!isPolygon) {
          ctx.rect(px - outset, py - outset, pw + outset * 2, ph + outset * 2)
        } else {
          shapePath()
        }
        ctx.stroke()
      }
    }

    if (isSelected && dungeonStore.drawMode === 'edit' && !isPolygon) drawResizeHandles(r)
  }
}

function drawResizeHandles(room) {
  const handles = getRoomHandles(room)
  const fill   = mapStyle.value === 'blueprint' ? '#ffaa55' : mapStyle.value === 'classic' ? '#ffffff' : '#ede1c7'
  const stroke = mapStyle.value === 'blueprint' ? '#0d2a3a' : '#1a1410'
  for (const pos of Object.values(handles)) {
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.fillRect(pos.x - HANDLE_DRAW, pos.y - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
    ctx.strokeRect(pos.x - HANDLE_DRAW, pos.y - HANDLE_DRAW, HANDLE_DRAW * 2, HANDLE_DRAW * 2)
  }
}

function drawDoorAt(cx, cy, nx, ny) {
  const scale   = cellPx.value / 25
  const bgW     = Math.max(6, 10 * scale)
  const fgW     = Math.max(1.5, 3 * scale)
  const halfLen = Math.max(5, 7 * scale)
  const knobR   = Math.max(2, 2.5 * scale)
  const tx = -ny, ty = nx

  const bgColor = mapStyle.value === 'blueprint' ? '#1d4868' : mapStyle.value === 'classic' ? '#ffffff' : '#ede1c7'
  ctx.strokeStyle = bgColor
  ctx.lineWidth = bgW
  ctx.lineCap = 'butt'
  ctx.beginPath()
  ctx.moveTo(cx - tx * halfLen, cy - ty * halfLen)
  ctx.lineTo(cx + tx * halfLen, cy + ty * halfLen)
  ctx.stroke()

  const fgColor = mapStyle.value === 'blueprint' ? '#b8e0f0' : '#1a1410'
  ctx.strokeStyle = fgColor
  ctx.lineWidth = fgW
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - tx * halfLen, cy - ty * halfLen)
  ctx.lineTo(cx + tx * halfLen, cy + ty * halfLen)
  ctx.stroke()

  const knobFill = mapStyle.value === 'blueprint' ? '#ffaa55' : '#8a1c1c'
  ctx.beginPath()
  ctx.arc(cx, cy, knobR, 0, Math.PI * 2)
  ctx.fillStyle = knobFill
  ctx.fill()
  ctx.strokeStyle = fgColor
  ctx.lineWidth = Math.max(0.5, 0.8 * scale)
  ctx.lineCap = 'butt'
  ctx.stroke()
}

function doorNormal(door, room) {
  if (door.wall !== undefined) {
    const horiz = door.wall === 'n' || door.wall === 's'
    return {
      nx: horiz ? 0 : (door.wall === 'w' ? -1 : 1),
      ny: horiz ? (door.wall === 'n' ? -1 : 1) : 0,
    }
  }
  const cs = cellPx.value
  const [cx, cy] = doorPixelPos(door, room)
  let nx = 0, ny = -1
  if (room.shape === 'circle') {
    const ecx = (room.origin_x + room.width / 2) * cs - viewport.value.offsetX
    const ecy = (room.origin_y + room.height / 2) * cs - viewport.value.offsetY
    const len = Math.hypot(cx - ecx, cy - ecy) || 1
    nx = (cx - ecx) / len; ny = (cy - ecy) / len
  } else if (room.shape === 'polygon' && room.points?.length >= 3) {
    let bestDist = Infinity
    for (let i = 0; i < room.points.length; i++) {
      const a = room.points[i], b = room.points[(i + 1) % room.points.length]
      const ax = a.x * cs - viewport.value.offsetX, ay = a.y * cs - viewport.value.offsetY
      const bx = b.x * cs - viewport.value.offsetX, by = b.y * cs - viewport.value.offsetY
      const dx = bx - ax, dy = by - ay
      const lenSq = dx * dx + dy * dy
      const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq))
      const dist = Math.hypot(cx - (ax + t * dx), cy - (ay + t * dy))
      if (dist < bestDist) {
        bestDist = dist
        const segLen = Math.sqrt(lenSq) || 1
        nx = -dy / segLen; ny = dx / segLen
      }
    }
  }
  return { nx, ny }
}

function drawDoors() {
  const selDoor = dungeonStore.selectedElement?.type === 'door' ? dungeonStore.selectedElement : null
  for (const [, room] of dungeonStore.rooms) {
    if (!room.doors?.length) continue
    for (const door of room.doors) {
      const isDragging = doorDrag && door.id === doorDrag.doorId
      const [cx, cy] = doorPixelPos(door, room)
      const { nx, ny } = doorNormal(door, room)
      if (isDragging) ctx.globalAlpha = 0.3
      drawDoorAt(cx, cy, nx, ny)
      if (isDragging) ctx.globalAlpha = 1
      if (selDoor?.id === door.id) {
        const selColor = mapStyle.value === 'blueprint' ? 'rgba(255,170,85,0.9)' : 'rgba(138,28,28,0.9)'
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, DOOR_HIT - 1, 0, Math.PI * 2)
        ctx.strokeStyle = selColor
        ctx.lineWidth = 1.5
        ctx.setLineDash([3, 3])
        ctx.stroke()
        ctx.restore()
      }
    }
  }
  if (doorDragGhost.value) {
    const { roomId, doorData } = doorDragGhost.value
    const room = dungeonStore.rooms.get(roomId)
    if (room) {
      const [cx, cy] = doorPixelPos(doorData, room)
      const { nx, ny } = doorNormal(doorData, room)
      drawDoorAt(cx, cy, nx, ny)
    }
  }
}

function drawCorridors() {
  const cs = cellPx.value
  const sc = styleColors.value
  const outerFrac = mapStyle.value === 'classic' ? 0.84 : 0.72
  const innerFrac = mapStyle.value === 'classic' ? 0.54 : 0.48

  for (const [id, c] of dungeonStore.corridors) {
    const ghost = corridorDragGhost.value?.id === id ? corridorDragGhost.value : null
    const displayC = ghost ? { ...c, points: ghost.points } : c
    const segs = corridorSegments(displayC)
    const isSelected = dungeonStore.selectedElement?.id === id
    const w = c.width ?? 1
    const outerW = outerFrac * cs * w
    const innerW = innerFrac * cs * w

    ctx.lineCap = 'square'
    ctx.lineJoin = 'miter'

    ctx.strokeStyle = isSelected ? sc.selectedColor : sc.wall
    ctx.lineWidth = outerW
    ctx.beginPath()
    segs.forEach((seg, i) => {
      const x1 = seg.x1 * cs - viewport.value.offsetX
      const y1 = seg.y1 * cs - viewport.value.offsetY
      const x2 = seg.x2 * cs - viewport.value.offsetX
      const y2 = seg.y2 * cs - viewport.value.offsetY
      if (i === 0) ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    })
    ctx.stroke()

    ctx.strokeStyle = sc.floor
    ctx.lineWidth = innerW
    ctx.beginPath()
    segs.forEach((seg, i) => {
      const x1 = seg.x1 * cs - viewport.value.offsetX
      const y1 = seg.y1 * cs - viewport.value.offsetY
      const x2 = seg.x2 * cs - viewport.value.offsetX
      const y2 = seg.y2 * cs - viewport.value.offsetY
      if (i === 0) ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    })
    ctx.stroke()

    if (isSelected) {
      const selOverlay = mapStyle.value === 'blueprint' ? 'rgba(255,170,85,0.22)' : 'rgba(138,28,28,0.22)'
      ctx.strokeStyle = selOverlay
      ctx.lineWidth = innerW
      ctx.beginPath()
      segs.forEach((seg, i) => {
        const x1 = seg.x1 * cs - viewport.value.offsetX
        const y1 = seg.y1 * cs - viewport.value.offsetY
        const x2 = seg.x2 * cs - viewport.value.offsetX
        const y2 = seg.y2 * cs - viewport.value.offsetY
        if (i === 0) ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
      })
      ctx.stroke()
    }
  }
}

function drawGhost() {
  const g = draw.ghost.value
  const cs = cellPx.value
  ctx.globalAlpha = 0.5
  const ghostFill   = mapStyle.value === 'blueprint' ? 'rgba(184,224,240,.15)' : 'rgba(138,28,28,.10)'
  const ghostStroke = mapStyle.value === 'blueprint' ? '#b8e0f0' : mapStyle.value === 'classic' ? '#000000' : '#8a1c1c'
  if (g.type === 'room' || g.type === 'circle') {
    const px = g.x * cs - viewport.value.offsetX
    const py = g.y * cs - viewport.value.offsetY
    const pw = g.w * cs
    const ph = g.h * cs
    ctx.fillStyle = ghostFill
    ctx.strokeStyle = ghostStroke
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    if (g.type === 'circle') {
      ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2)
    } else {
      ctx.rect(px, py, pw, ph)
    }
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
  } else if (g.type === 'polygon') {
    ctx.globalAlpha = 1
    const pts = g.points
    if (!pts.length) { ctx.globalAlpha = 1; return }

    ctx.strokeStyle = ghostStroke
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => {
      const ppx = p.x * cs - viewport.value.offsetX
      const ppy = p.y * cs - viewport.value.offsetY
      if (i === 0) ctx.moveTo(ppx, ppy)
      else ctx.lineTo(ppx, ppy)
    })
    ctx.stroke()

    if (g.mouseX !== undefined) {
      const last = pts[pts.length - 1]
      ctx.strokeStyle = ghostStroke
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(last.x * cs - viewport.value.offsetX, last.y * cs - viewport.value.offsetY)
      ctx.lineTo(g.mouseX * cs - viewport.value.offsetX, g.mouseY * cs - viewport.value.offsetY)
      ctx.stroke()
      ctx.setLineDash([])
    }

    pts.forEach((p, i) => {
      const ppx = p.x * cs - viewport.value.offsetX
      const ppy = p.y * cs - viewport.value.offsetY
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(ppx, ppy, i === 0 ? 5 : 3, 0, Math.PI * 2)
      ctx.fill()
    })

    if (pts.length >= 3) {
      const first = pts[0]
      ctx.strokeStyle = '#f5d76e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(first.x * cs - viewport.value.offsetX, first.y * cs - viewport.value.offsetY, 8, 0, Math.PI * 2)
      ctx.stroke()
    }
  } else if (g.type === 'corridor') {
    const pts = g.points ?? []
    if (!pts.length) return
    ctx.strokeStyle = '#c8a86b'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.setLineDash([4, 4])

    ctx.beginPath()
    pts.forEach((p, i) => {
      const px = p.x * cs - viewport.value.offsetX
      const py = p.y * cs - viewport.value.offsetY
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()

    if (g.mouseX !== undefined) {
      const last = pts[pts.length - 1]
      ctx.strokeStyle = 'rgba(200,168,107,.55)'
      ctx.beginPath()
      ctx.moveTo(last.x * cs - viewport.value.offsetX, last.y * cs - viewport.value.offsetY)
      ctx.lineTo(g.mouseX * cs - viewport.value.offsetX, g.mouseY * cs - viewport.value.offsetY)
      ctx.stroke()
    }
    ctx.setLineDash([])

    pts.forEach((p, i) => {
      const px = p.x * cs - viewport.value.offsetX
      const py = p.y * cs - viewport.value.offsetY
      ctx.fillStyle = i === 0 ? '#f5d76e' : '#c8a86b'
      ctx.beginPath()
      ctx.arc(px, py, i === 0 ? 5 : 3.5, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  ctx.globalAlpha = 1
}


function getRect() {
  return canvasEl.value.getBoundingClientRect()
}

function onMouseDown(e) {
  if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && dungeonStore.drawMode === 'pan')) {
    isPanning = true
    panStart = { x: e.clientX, y: e.clientY }
    panOrigin = { ...viewport.value }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return
  }

  if (e.button === 0 && props.mapMoveMode === 'image' && dungeonStore.dungeon?.map_image_path) {
    isPanning = true
    panStart = { x: e.clientX, y: e.clientY }
    panOrigin = { ...viewport.value, imageOffsetX: dungeonStore.dungeon.map_image_offset_x ?? 0, imageOffsetY: dungeonStore.dungeon.map_image_offset_y ?? 0 }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return
  }

  if (e.button === 0 && dungeonStore.drawMode === 'fog' && sessionStore.isGM) {
    const rect = getRect()
    const { cellX, cellY } = pixelToCell(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    const brushMode = e.shiftKey ? 'hide' : 'reveal'
    fogBrush = { mode: brushMode, seen: new Set() }
    _applyFogBrush(cellX, cellY)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return
  }

  if (e.button === 0 && (dungeonStore.drawMode === 'door' || dungeonStore.drawMode === 'select' || dungeonStore.drawMode === 'edit')) {
    const rect = getRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const near = findDoorAtClick(mx, my)
    if (near) {
      if (dungeonStore.drawMode === 'select') {
        dungeonStore.selectElement('door', near.doorId, { roomId: near.roomId })
        skipNextDoorClick = true
      } else {
        doorDrag = near
        doorDragMoved = false
        doorDragGhost.value = null
      }
      return
    }
  }

  if (e.button === 0 && dungeonStore.drawMode === 'edit' && dungeonStore.selectedElement?.type === 'room') {
    const room = dungeonStore.rooms.get(dungeonStore.selectedElement.id)
    if (room) {
      const rect = getRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const handle = room.shape === 'polygon' ? null : hitTestHandle(mx, my, room)
      if (handle) {
        isResizing = true
        didResize = false
        resizeHandle = handle
        resizeRoomId = dungeonStore.selectedElement.id
        resizeOriginal = { ...room }
        resizeGhost.value = { ...room }
        const { gx, gy } = pixelToGrid(mx, my, viewport.value)
        resizeStartGrid = { gx, gy }
        dungeonStore.beginRoomEdit(resizeRoomId, ['origin_x', 'origin_y', 'width', 'height'])
        return
      }
      const { gx, gy } = pixelToGrid(mx, my, viewport.value)
      const hitId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
      if (hitId === dungeonStore.selectedElement.id) {
        isMoving = true
        didMove = false
        moveRoomId = hitId
        moveOriginal = { ...room }
        moveGhost.value = { ...room }
        moveStartGrid = { gx, gy }
        dungeonStore.beginRoomEdit(moveRoomId, ['origin_x', 'origin_y', 'points'])
        return
      }
    }
  }

  if (e.button === 0 && dungeonStore.drawMode === 'edit' && dungeonStore.selectedElement?.type === 'corridor') {
    const corridor = dungeonStore.corridors.get(dungeonStore.selectedElement.id)
    if (corridor?.points?.length >= 2) {
      const rect = getRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const ptIdx = hitTestCorridorPoint(mx, my, corridor)
      if (ptIdx !== -1) {
        const { gx, gy } = pixelToGrid(mx, my, viewport.value)
        corridorDrag = { id: corridor.id, type: 'point', pointIndex: ptIdx, originalPoints: corridor.points.map(p => ({ ...p })), startGx: gx, startGy: gy }
        didCorridorDrag = false
        corridorDragGhost.value = { id: corridor.id, points: corridor.points.map(p => ({ ...p })) }
        return
      }
      const { gx, gy } = pixelToGrid(mx, my, viewport.value)
      if (draw.hitTestCorridor(gx, gy, dungeonStore.corridors) === corridor.id) {
        corridorDrag = { id: corridor.id, type: 'whole', originalPoints: corridor.points.map(p => ({ ...p })), startGx: gx, startGy: gy }
        didCorridorDrag = false
        corridorDragGhost.value = { id: corridor.id, points: corridor.points.map(p => ({ ...p })) }
        return
      }
    }
  }

  if (dungeonStore.drawMode === 'room' || dungeonStore.drawMode === 'circle') {
    draw.onMouseDown(e, dungeonStore.drawMode, getRect())
  }
}

function onMouseMove(e) {
  if (isPanning && props.mapMoveMode === 'image') {
    const dx = (e.clientX - panStart.x) / viewport.value.zoom
    const dy = (e.clientY - panStart.y) / viewport.value.zoom
    emit('image-offset-change', {
      offsetX: panOrigin.imageOffsetX + dx,
      offsetY: panOrigin.imageOffsetY + dy,
    })
    return
  }

  if (isPanning) {
    viewport.value = {
      offsetX: panOrigin.offsetX - (e.clientX - panStart.x),
      offsetY: panOrigin.offsetY - (e.clientY - panStart.y),
      zoom: panOrigin.zoom,
    }
    return
  }

  if (fogBrush) {
    const rect = getRect()
    const { cellX, cellY } = pixelToCell(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    _applyFogBrush(cellX, cellY)
    return
  }

  if (corridorDrag) {
    const rect = getRect()
    const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    if (corridorDrag.type === 'point') {
      corridorDragGhost.value = { id: corridorDrag.id, points: corridorDrag.originalPoints.map((p, i) =>
        i === corridorDrag.pointIndex ? { x: gx, y: gy } : { ...p }
      )}
    } else {
      const dx = gx - corridorDrag.startGx
      const dy = gy - corridorDrag.startGy
      corridorDragGhost.value = { id: corridorDrag.id, points: corridorDrag.originalPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) }
    }
    didCorridorDrag = true
    return
  }

  if (doorDrag) {
    const rect = getRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const wall = findRoomWall(mx, my)
    if (wall) {
      doorDragMoved = true
      const { roomId, ...doorData } = wall
      doorDragGhost.value = { roomId, doorData: { id: doorDrag.doorId, ...doorData } }
    }
    return
  }

  if (isResizing) {
    const rect = getRect()
    const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    resizeGhost.value = applyResize(resizeHandle, resizeOriginal, resizeStartGrid.gx, resizeStartGrid.gy, gx, gy)
    didResize = true
    return
  }

  if (isMoving) {
    const rect = getRect()
    const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    const dx = gx - moveStartGrid.gx
    const dy = gy - moveStartGrid.gy
    const movePatch = { origin_x: moveOriginal.origin_x + dx, origin_y: moveOriginal.origin_y + dy }
    if (moveOriginal.shape === 'polygon' && moveOriginal.points) {
      movePatch.points = moveOriginal.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
    }
    moveGhost.value = { ...moveOriginal, ...movePatch }
    didMove = true
    return
  }

  if (dungeonStore.drawMode === 'edit' && dungeonStore.selectedElement?.type === 'room') {
    const room = dungeonStore.rooms.get(dungeonStore.selectedElement.id)
    const rect = getRect()
    hoveredHandle.value = room ? hitTestHandle(e.clientX - rect.left, e.clientY - rect.top, room) : null
    hoveredCorridorPoint.value = -1
  } else if (dungeonStore.drawMode === 'edit' && dungeonStore.selectedElement?.type === 'corridor') {
    hoveredHandle.value = null
    const corridor = dungeonStore.corridors.get(dungeonStore.selectedElement.id)
    if (corridor?.points?.length >= 2) {
      const rect = getRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const ptIdx = hitTestCorridorPoint(mx, my, corridor)
      if (ptIdx !== -1) {
        hoveredCorridorPoint.value = ptIdx
      } else {
        const { gx, gy } = pixelToGrid(mx, my, viewport.value)
        hoveredCorridorPoint.value = draw.hitTestCorridor(gx, gy, dungeonStore.corridors) === corridor.id ? -2 : -1
      }
    } else {
      hoveredCorridorPoint.value = -1
    }
  } else {
    hoveredHandle.value = null
    hoveredCorridorPoint.value = -1
  }

  draw.onMouseMove(e, dungeonStore.drawMode, getRect())
}

function onMouseUp(e) {
  if (fogBrush) {
    fogBrush = null
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    return
  }

  if (isPanning) {
    isPanning = false
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
    return
  }

  if (corridorDrag) {
    if (didCorridorDrag && corridorDragGhost.value) {
      dungeonStore.updateCorridor(corridorDrag.id, { points: corridorDragGhost.value.points })
    }
    corridorDrag = null
    corridorDragGhost.value = null

    return
  }

  if (doorDrag) {
    if (doorDragMoved && doorDragGhost.value) {
      const { roomId, doorData } = doorDragGhost.value
      dungeonStore.moveDoor(doorDrag.roomId, doorDrag.doorId, roomId, doorData)
      dungeonStore.deselect()
    } else {
      dungeonStore.selectElement('door', doorDrag.doorId, { roomId: doorDrag.roomId })
    }
    doorDrag = null
    doorDragGhost.value = null
    doorDragMoved = false
    skipNextDoorClick = true
    return
  }

  if (isResizing) {
    if (didResize && resizeGhost.value) {
      const { origin_x, origin_y, width, height } = resizeGhost.value
      dungeonStore.updateRoom(resizeRoomId, { origin_x, origin_y, width, height })
    }
    isResizing = false
    resizeHandle = null
    resizeRoomId = null
    resizeStartGrid = null
    resizeOriginal = null
    resizeGhost.value = null
    dungeonStore.endRoomEdit()
    return
  }

  if (isMoving) {
    if (didMove && moveGhost.value) {
      const { origin_x, origin_y } = moveGhost.value
      const moveSavePatch = { origin_x, origin_y }
      if (moveGhost.value.shape === 'polygon') moveSavePatch.points = moveGhost.value.points
      dungeonStore.updateRoom(moveRoomId, moveSavePatch)
    }
    isMoving = false
    moveRoomId = null
    moveStartGrid = null
    moveOriginal = null
    moveGhost.value = null
    dungeonStore.endRoomEdit()
    return
  }

  if (dungeonStore.drawMode === 'room' || dungeonStore.drawMode === 'circle') {
    const result = draw.onMouseUp(e, dungeonStore.drawMode, getRect())
    if (result) {
      const { type: _type, ...roomData } = result
      dungeonStore.addRoom({
        dungeon_id: props.dungeonId,
        session_id: dungeonStore.dungeon?.session_id,
        ...roomData,
      })
    }
  }
}

function onClick(e) {
  if (dungeonStore.drawMode === 'fog') return
  if (didResize)        { didResize = false; return }
  if (didMove)          { didMove = false; return }
  if (didCorridorDrag)  { didCorridorDrag = false; return }

  if (dungeonStore.drawMode === 'door') {
    if (skipNextDoorClick) { skipNextDoorClick = false; return }
    const rect = getRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    if (!findDoorAtClick(mx, my)) {
      const hit = findRoomWall(mx, my)
      if (hit) {
        const { roomId, ...doorData } = hit
        dungeonStore.addDoor(roomId, doorData)
      }
    }
    return
  }

  if (dungeonStore.drawMode === 'polygon') {
    const result = draw.onPolygonClick(e, getRect())
    if (result) {
      const { type: _type, ...roomData } = result
      dungeonStore.addRoom({
        dungeon_id: props.dungeonId,
        session_id: dungeonStore.dungeon?.session_id,
        ...roomData,
      })
    }
    return
  }

  if (dungeonStore.drawMode === 'corridor') {
    const result = draw.onCanvasClick(e, 'corridor', getRect())
    if (result) {
      const { type: _type, ...corridorData } = result
      dungeonStore.addCorridor({
        dungeon_id: props.dungeonId,
        session_id: dungeonStore.dungeon?.session_id,
        ...corridorData,
      })
    }
    return
  }

  if (dungeonStore.drawMode === 'select' || dungeonStore.drawMode === 'edit') {
    if (skipNextDoorClick) { skipNextDoorClick = false; return }
    const rect = getRect()
    const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)
    const roomId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
    if (roomId) {
      dungeonStore.selectElement('room', roomId)
      if (dungeonStore.drawMode === 'edit') dungeonStore.drawMode = 'select'
      return
    }
    const corridorId = draw.hitTestCorridor(gx, gy, dungeonStore.corridors)
    if (corridorId) {
      dungeonStore.selectElement('corridor', corridorId)
      if (dungeonStore.drawMode === 'edit') dungeonStore.drawMode = 'select'
      return
    }
    // fog mode has no rooms to select - the revealed cell is the annotation
    // target (GMs can annotate through fog, players only revealed ground)
    if (dungeonStore.fogMode) {
      const cellX = Math.floor(gx)
      const cellY = Math.floor(gy)
      if (sessionStore.isGM || dungeonStore.isCellPlaceable(cellX, cellY)) {
        dungeonStore.selectElement('cell', `${cellX}:${cellY}`, { x: cellX, y: cellY })
        if (dungeonStore.drawMode === 'edit') dungeonStore.drawMode = 'select'
        return
      }
    }
    dungeonStore.deselect()
    if (dungeonStore.drawMode === 'edit') dungeonStore.drawMode = 'select'
  }
}

function onDoubleClick(e) {
  if (dungeonStore.drawMode === 'corridor') {
    const result = draw.commitCorridor()
    if (result) {
      const { type: _type, ...corridorData } = result
      dungeonStore.addCorridor({
        dungeon_id: props.dungeonId,
        session_id: dungeonStore.dungeon?.session_id,
        ...corridorData,
      })
    }
    return
  }

  const rect = getRect()
  const { gx, gy } = pixelToGrid(e.clientX - rect.left, e.clientY - rect.top, viewport.value)

  if (dungeonStore.drawMode === 'room' || dungeonStore.drawMode === 'circle') {
    draw.cancel()
    dimEntry.value = { gx, gy, screenX: e.clientX - rect.left, screenY: e.clientY - rect.top }
    setTimeout(() => document.querySelector('.ds-dim-input input')?.select(), 30)
    return
  }

  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const doorHit = findDoorAtClick(mx, my)
  if (doorHit) {
    dungeonStore.drawMode = 'edit'
    dungeonStore.selectElement('door', doorHit.doorId, { roomId: doorHit.roomId })
    return
  }
  const roomId = draw.hitTestRoom(gx, gy, dungeonStore.rooms)
  if (roomId) {
    dungeonStore.drawMode = 'edit'
    dungeonStore.selectElement('room', roomId)
    return
  }
  const corridorId = draw.hitTestCorridor(gx, gy, dungeonStore.corridors)
  if (corridorId) {
    dungeonStore.drawMode = 'edit'
    dungeonStore.selectElement('corridor', corridorId)
    return
  }
}

function submitDim() {
  if (!dimEntry.value) return
  const w = Math.max(1, Math.round(parseFloat(dimW.value) || 1))
  const h = Math.max(1, Math.round(parseFloat(dimH.value) || 1))
  dungeonStore.addRoom({
    dungeon_id: props.dungeonId,
    session_id: dungeonStore.dungeon?.session_id,
    origin_x: dimEntry.value.gx,
    origin_y: dimEntry.value.gy,
    width: w,
    height: h,
    shape: dungeonStore.drawMode === 'circle' ? 'circle' : 'rect',
    label: null,
  })
  dimEntry.value = null
  dungeonStore.drawMode = 'select'
}

function openAnnotation(type, id) {
  dungeonStore.selectElement(type, id)
}

function _applyFogBrush(cellX, cellY) {
  if (!fogBrush || !props.dungeonId) return
  const r = fogBrushRadius.value
  const cells = []
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const key = `${cellX + dx}:${cellY + dy}`
      if (!fogBrush.seen.has(key)) {
        fogBrush.seen.add(key)
        cells.push({ cellX: cellX + dx, cellY: cellY + dy })
      }
    }
  }
  if (!cells.length) return
  if (fogBrush.mode === 'reveal') {
    dungeonStore.revealFogCells(props.dungeonId, cells)
  } else {
    dungeonStore.hideFogCells(props.dungeonId, cells)
  }
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const rect = getRect()
    applyZoom(factor, e.clientX - rect.left, e.clientY - rect.top)
  } else {
    viewport.value = {
      ...viewport.value,
      offsetX: viewport.value.offsetX + e.deltaX,
      offsetY: viewport.value.offsetY + e.deltaY,
    }
  }
}

let touchPanStart = null
let pinch = null
let didTouchPan = false

function touchDist(touches) {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  )
}

function touchMid(touches, rect) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2 - rect.left,
    y: (touches[0].clientY + touches[1].clientY) / 2 - rect.top,
  }
}

function onTouchStart(e) {
  if (e.touches.length === 1) {
    pinch = null
    didTouchPan = false
    touchPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, offsetX: viewport.value.offsetX, offsetY: viewport.value.offsetY }
  } else if (e.touches.length === 2) {
    touchPanStart = null
    const rect = getRect()
    const mid = touchMid(e.touches, rect)
    pinch = { dist: touchDist(e.touches), x: mid.x, y: mid.y }
  }
}

function onTouchMove(e) {
  if (pinch && e.touches.length === 2) {
    e.preventDefault()
    const rect = getRect()
    const dist = touchDist(e.touches)
    const mid = touchMid(e.touches, rect)
    applyZoom(dist / pinch.dist, mid.x, mid.y)
    viewport.value = {
      ...viewport.value,
      offsetX: viewport.value.offsetX - (mid.x - pinch.x),
      offsetY: viewport.value.offsetY - (mid.y - pinch.y),
    }
    pinch = { dist, x: mid.x, y: mid.y }
    return
  }
  if (!touchPanStart || e.touches.length !== 1) return
  const dx = e.touches[0].clientX - touchPanStart.x
  const dy = e.touches[0].clientY - touchPanStart.y
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didTouchPan = true
  if (!didTouchPan) return
  e.preventDefault()
  viewport.value = {
    ...viewport.value,
    offsetX: touchPanStart.offsetX - dx,
    offsetY: touchPanStart.offsetY - dy,
  }
}

function onTouchEnd(e) {
  if (e.touches.length === 0) {
    touchPanStart = null
    pinch = null
    didTouchPan = false
  } else if (e.touches.length === 1 && pinch) {
    pinch = null
    didTouchPan = true
    touchPanStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, offsetX: viewport.value.offsetX, offsetY: viewport.value.offsetY }
  }
}


function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === 'Escape') { dimEntry.value = null; draw.cancel(); dungeonStore.deselect(); return }
  if (e.key === 'Enter' && dungeonStore.drawMode === 'corridor') {
    const result = draw.commitCorridor()
    if (result) {
      const { type: _type, ...corridorData } = result
      dungeonStore.addCorridor({ dungeon_id: props.dungeonId, session_id: dungeonStore.dungeon?.session_id, ...corridorData })
    }
    return
  }
  if (e.key === 'v' || e.key === 'V') { dungeonStore.drawMode = 'select'; return }
  if (e.key === 'h' || e.key === 'H') { dungeonStore.drawMode = 'pan'; return }
  if (e.key === 'e' || e.key === 'E') { dungeonStore.drawMode = 'edit'; return }
  if ((e.key === 'f' || e.key === 'F') && sessionStore.isGM && dungeonStore.fogMode) {
    dungeonStore.drawMode = dungeonStore.drawMode === 'fog' ? 'select' : 'fog'
    return
  }
  if (e.key === 'r' || e.key === 'R') { dungeonStore.drawMode = 'room'; return }
  if (e.key === 'o' || e.key === 'O') { dungeonStore.drawMode = 'circle'; return }
  if (e.key === 'c' || e.key === 'C') { dungeonStore.drawMode = 'corridor'; return }
  if (e.key === 'p' || e.key === 'P') { dungeonStore.drawMode = 'pan'; return }
  if (e.key === 'd' || e.key === 'D') { dungeonStore.drawMode = 'door'; return }
  if (e.key === 'w' || e.key === 'W') { dungeonStore.drawMode = 'polygon'; return }
  // generation is a solo/co-op feature, gated like the toolbar button.
  // generateRoom also guards itself (store-level generating flag), so key
  // repeat can't mass-produce rooms
  if (e.key === 'g' || e.key === 'G') {
    if (sessionStore.playMode === 'gm_less') void dungeonStore.generateRoom()
    return
  }
  if (e.key === '=' || e.key === '+') { zoomIn(); return }
  if (e.key === '-' || e.key === '_') { zoomOut(); return }
  if ((e.key === 'Delete' || e.key === 'Backspace') && dungeonStore.selectedElement) {
    const { type, id, roomId } = dungeonStore.selectedElement
    if (type === 'room') {
      confirm('Delete this room?', () => dungeonStore.deleteRoom(id))
    } else if (type === 'door') {
      dungeonStore.removeDoor(roomId, id)
      dungeonStore.deselect()
    } else if (type === 'token') {
      if (canDeleteToken(id)) dungeonStore.removeToken(id)
    } else if (type === 'icon') {
      confirm('Remove this icon?', () => dungeonStore.removeIcon(id))
    } else if (type === 'cell') {
      dungeonStore.deselect()
    } else {
      dungeonStore.deleteCorridor(id)
    }
  }
}


const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    canvasWidth.value = entry.contentRect.width
    canvasHeight.value = entry.contentRect.height
    if (canvasEl.value) {
      canvasEl.value.width = canvasWidth.value
      canvasEl.value.height = canvasHeight.value
    }
  }
})

onMounted(() => {
  ctx = canvasEl.value.getContext('2d')
  canvasWidth.value = containerEl.value.clientWidth
  canvasHeight.value = containerEl.value.clientHeight
  canvasEl.value.width = canvasWidth.value
  canvasEl.value.height = canvasHeight.value
  resizeObserver.observe(containerEl.value)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('mousemove', onCursorTrack)
  document.addEventListener('mouseleave', onDocumentMouseLeave)
  if (props.dungeonId) initCursorChannel(props.dungeonId)
  rafId = requestAnimationFrame(renderFrame)
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
  resizeObserver.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mousemove', onCursorTrack)
  document.removeEventListener('mouseleave', onDocumentMouseLeave)
  broadcastCursorHidden()
  if (cursorChannel) realtime.removeChannel(cursorChannel)
  if (_stopCursorWatch) _stopCursorWatch()
})
</script>

<style scoped>
.ds-dim-input {
  position: absolute;
  background: var(--ink, #1a1410);
  color: var(--paper, #ede1c7);
  border: 1px solid var(--accent, #8a1c1c);
  padding: 6px 8px;
  border-radius: 4px;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 6px 18px rgba(0,0,0,.5);
  z-index: 50;
  pointer-events: auto;
}

.ds-dim-input input {
  width: auto;
  background: transparent;
  border: 0;
  border-bottom: 1px solid rgba(237,225,199,.4);
  color: var(--paper, #ede1c7);
  font-family: inherit;
  font-size: inherit;
  outline: none;
  text-align: center;
}
.ds-dim-input input:focus { border-bottom-color: var(--accent-2, #b8541c); }
.ds-dim-input span { color: var(--paper-edge, #b89c6a); font-size: 11px; }

.ds-dim-btn {
  background: var(--ink, #1a1410);
  color: var(--paper, #ede1c7);
  border: 1px solid rgba(237,225,199,.3);
  border-radius: 3px;
  padding: 2px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  transition: background .12s, border-color .12s;
}
.ds-dim-btn:hover { background: var(--accent, #8a1c1c); border-color: var(--accent, #8a1c1c); }
.ds-dim-ghost { background: transparent; color: rgba(237,225,199,.5); }
.ds-dim-ghost:hover { background: rgba(237,225,199,.1); border-color: rgba(237,225,199,.3); color: var(--paper, #ede1c7); }

.ds-token-tip {
  position: absolute;
  z-index: 30;
  pointer-events: none;
  max-width: 240px;
  padding: 7px 10px;
  background: rgba(13,10,7,.94);
  border: 1px solid rgba(237,225,199,.35);
  border-radius: 5px;
  box-shadow: 0 4px 16px rgba(0,0,0,.6);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ds-token-tip-name {
  font-family: var(--font-display, serif);
  font-size: 14px;
  color: #ede1c7;
  line-height: 1.15;
}
.ds-token-tip-stats {
  display: flex;
  gap: 10px;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: rgba(237,225,199,.8);
  letter-spacing: .04em;
  white-space: nowrap;
}
.ds-token-tip-conds {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ds-token-tip-cond {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 9px;
  border: 1px solid var(--cond-color);
  background: rgba(237,225,199,.06);
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 10.5px;
  color: #ede1c7;
  letter-spacing: .02em;
}
.ds-token-tip-cond i { color: var(--cond-color); font-size: 10px; }

.ds-fog-size-picker {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 25;
  pointer-events: auto;
  background: rgba(13,10,7,.94);
  border: 1px solid rgba(237,225,199,.35);
  border-radius: 5px;
  padding: 5px 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,.6);
}
.ds-fog-size-label {
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  color: rgba(237,225,199,.55);
  letter-spacing: .06em;
  text-transform: uppercase;
  padding-right: 4px;
  border-right: 1px solid rgba(237,225,199,.15);
  margin-right: 2px;
}
.ds-fog-size-btn {
  background: rgba(237,225,199,.08);
  color: var(--paper, #ede1c7);
  border: 1px solid rgba(237,225,199,.3);
  border-radius: 3px;
  padding: 4px 12px;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
  font-size: 11px;
  cursor: pointer;
  transition: background .12s, border-color .12s, box-shadow .12s;
}
.ds-fog-size-btn:hover {
  background: rgba(237,225,199,.16);
  border-color: rgba(237,225,199,.55);
}
.ds-fog-size-btn--active {
  background: var(--accent, #8a1c1c);
  border-color: rgba(237,225,199,.5);
  color: var(--paper, #ede1c7);
  box-shadow: 0 0 8px rgba(138,28,28,.5);
}
</style>
