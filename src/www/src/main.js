import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import VueApexCharts from 'vue3-apexcharts';

import App from './App.vue';
import messages from './locales/messages';
import './style.css';

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('lang') || 'en',
  fallbackLocale: 'en',
  messages,
});

const app = createApp(App);
app.use(i18n);
app.component('apexchart', VueApexCharts);
app.mount('#app');
