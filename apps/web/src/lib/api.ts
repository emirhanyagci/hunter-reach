import axios from 'axios';
import Cookies from 'js-cookie';

/** Same-origin `/api` works when next.config.js rewrites to the Nest server; override with full URL if needed. */
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      Cookies.remove('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ── CSV ────────────────────────────────────────────────────────────────────────
export const csvApi = {
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/csv/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
  },
  getImports: () => api.get('/csv/imports').then((r) => r.data),
  getImportContacts: (importId: string) =>
    api.get(`/csv/imports/${importId}/contacts`).then((r) => r.data),
};

// ── Contacts ──────────────────────────────────────────────────────────────────
export const contactsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/contacts', { params }).then((r) => r.data),
  getStats: () => api.get('/contacts/stats').then((r) => r.data),
  getOne: (id: string) => api.get(`/contacts/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/contacts', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/contacts/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/contacts/${id}`).then((r) => r.data),
  bulkDelete: (ids: string[]) => api.delete('/contacts/bulk', { data: { ids } }).then((r) => r.data),
};

// ── Templates ─────────────────────────────────────────────────────────────────
export const templatesApi = {
  getAll: (categoryId?: string) =>
    api.get('/templates', { params: categoryId ? { categoryId } : {} }).then((r) => r.data),
  getOne: (id: string) => api.get(`/templates/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/templates', data).then((r) => r.data),
  update: (id: string, data: any) => api.put(`/templates/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/templates/${id}`).then((r) => r.data),
  preview: (id: string, contactId: string) =>
    api.post(`/templates/${id}/preview`, { contactId }).then((r) => r.data),
  getCategories: () => api.get('/templates/categories').then((r) => r.data),
  createCategory: (name: string) => api.post('/templates/categories', { name }).then((r) => r.data),
  sendTestEmail: (data: {
    subject: string;
    bodyHtml: string;
    bodyText?: string;
    contactId?: string;
    toEmail?: string;
    templateId?: string;
    customData?: Record<string, string>;
  }) => api.post('/templates/test-email', data).then((r) => r.data),
  sendToContact: (data: {
    contactId: string;
    templateId: string;
    gender?: string;
    customSubject?: string;
    customBodyHtml?: string;
    customBodyText?: string;
  }) => api.post('/templates/send-to-contact', data).then((r) => r.data),
  uploadAttachments: (templateId: string, files: File[]) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api
      .post(`/templates/${templateId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  deleteAttachment: (templateId: string, attachmentId: string) =>
    api.delete(`/templates/${templateId}/attachments/${attachmentId}`).then((r) => r.data),
};

// ── Campaigns ─────────────────────────────────────────────────────────────────
export const campaignsApi = {
  getAll: () => api.get('/campaigns').then((r) => r.data),
  getStats: () => api.get('/campaigns/stats').then((r) => r.data),
  getOne: (id: string) => api.get(`/campaigns/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/campaigns', data).then((r) => r.data),
  cancel: (id: string) => api.delete(`/campaigns/${id}`).then((r) => r.data),
  detectGenders: (contactIds: string[]) =>
    api.post('/campaigns/detect-genders', { contactIds }).then((r) => r.data),
};

// ── Routing Rules ─────────────────────────────────────────────────────────────
export const routingRulesApi = {
  getAll: () => api.get('/routing-rules').then((r) => r.data),
  create: (data: { categoryName: string; keywords: string[]; templateId?: string; priority?: number }) =>
    api.post('/routing-rules', data).then((r) => r.data),
  update: (id: string, data: { categoryName?: string; keywords?: string[]; templateId?: string; priority?: number }) =>
    api.put(`/routing-rules/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/routing-rules/${id}`).then((r) => r.data),
  previewRouting: (contactIds: string[], fallbackTemplateId?: string) =>
    api.post('/routing-rules/preview', { contactIds, fallbackTemplateId }).then((r) => r.data),
};

// ── Email Jobs ─────────────────────────────────────────────────────────────────
export const emailJobsApi = {
  getAll: (params?: Record<string, any>) =>
    api.get('/email-jobs', { params }).then((r) => r.data),
  getOne: (id: string) => api.get(`/email-jobs/${id}`).then((r) => r.data),
  getContactActivity: (contactId: string) =>
    api.get(`/email-jobs/contact/${contactId}`).then((r) => r.data),
  cancel: (id: string) => api.patch(`/email-jobs/${id}/cancel`).then((r) => r.data),
  retry: (id: string) => api.patch(`/email-jobs/${id}/retry`).then((r) => r.data),
  sendReminder: (data: { emailJobIds: string[]; templateId: string; customSubject?: string; customBodyHtml?: string }) =>
    api.post('/email-jobs/remind', data).then((r) => r.data),
};
