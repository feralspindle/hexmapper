import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/index.js'
import App from './App.vue'
import './style.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import { vTooltip } from './directives/tooltip.js'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.directive('tooltip', vTooltip)
app.mount('#app')
