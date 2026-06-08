<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    content: string
    width?: number
  }>(),
  {
    width: 320,
  },
)
</script>

<template>
  <el-popover
    trigger="click"
    placement="top"
    :width="width"
    popper-class="info-tip-popper"
  >
    <template #reference>
      <button
        class="info-tip"
        type="button"
        :aria-label="`查看${title}说明`"
      >
        ?
      </button>
    </template>
    <div class="info-tip__panel">
      <div class="info-tip__title">
        {{ title }}
      </div>
      <p class="info-tip__content">
        {{ content }}
      </p>
    </div>
  </el-popover>
</template>

<style scoped lang="scss">
.info-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 999px;
  padding: 0;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  color: #fffdf8;
  background: linear-gradient(135deg, #0f766e, #c98a2e);
  cursor: pointer;
}

.info-tip__panel {
  display: grid;
  gap: 8px;
}

.info-tip__title {
  font-size: 14px;
  font-weight: 800;
  color: #173b39;
}

.info-tip__content {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #445856;
}
</style>
