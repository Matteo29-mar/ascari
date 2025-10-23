import axios from 'axios'
export const API = import.meta.env.VITE_API || 'http://localhost:4001'

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4001',
})

export async function ping() {
  return http.get('/health'); // 200 se DB up
}


http.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) {
    cfg.headers = cfg.headers || {}
    cfg.headers['Authorization'] = 'Bearer ' + token
  }
  return cfg
})
