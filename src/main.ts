import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { createApp } from 'vue'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { router } from './app/router'
import './app/providers/echarts'
import './app/styles/index.scss'

dayjs.locale('zh-cn')

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, {
  locale: zhCn,
})

app.mount('#app')
