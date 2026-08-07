<template>
  <apexchart height="40" width="100%" :type="chartType" :options="options" :series="seriesData" />
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  data: { type: Array, required: true },
  chartType: { type: String, default: 'area' },
  color: { type: String, default: 'rgba(255,255,255,0.35)' },
});

const seriesData = computed(() => [{ data: props.data }]);

const options = computed(() => ({
  chart: {
    type: props.chartType,
    sparkline: { enabled: true },
    animations: { enabled: false },
    background: 'transparent',
  },
  colors: [props.color],
  stroke: { curve: 'smooth', width: props.chartType === 'line' ? 2 : 0 },
  fill: { opacity: props.chartType === 'bar' ? 0.6 : 0.25 },
  tooltip: { enabled: false },
  theme: { mode: 'dark' },
}));
</script>
