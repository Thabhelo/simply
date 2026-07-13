export const emailJsServiceId = import.meta.env.VITE_EMAILJS_SERVICE_ID ?? ''
export const emailJsTemplateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? ''
export const emailJsPublicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY ?? ''

export function isContactFormConfigured() {
  return Boolean(emailJsServiceId && emailJsTemplateId && emailJsPublicKey)
}
