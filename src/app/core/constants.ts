import { environment } from '../../environments/environment';

const BASE = environment.apiBaseUrl;

export const API_URLS = {
  // Auth
  LOGIN:   `${BASE}/Login/login`,
  SIGNUP:  `${BASE}/Login/signup`,

  // Masters
  COUNTRYWITHSTATES:  `${BASE}/Countries/GetCountriesWithStates`,
  GETALLLOCATIONS:    `${BASE}/Location/GetAllLocation`,
  GETALLMATERIALS:    `${BASE}/Material/GetAllMaterials`,
  GETPRODUCTBYGROUPANDQUALITY: `${BASE}/Material`,

  // Location Material Price
  SAVEMATERIALPRICE:              `${BASE}/LocationMaterialPrice/AddLocationMaterialPrice`,
  GETALLMATERIALPRICE:            `${BASE}/LocationMaterialPrice/GetAllLocationMaterialPriceView`,
  GETALLMATERIALPRICEBYID:        `${BASE}/LocationMaterialPrice/GetLocationMaterialPriceById`,
  MATERIAL_PRICE_MASTER:          `${BASE}/LocationMaterialPrice`,
  GETALLMATERIALPRICEBYLOCATIONID:`${BASE}/LocationMaterialPrice/GetLocationMaterialPriceByLocationId`,
  UPDATEMATERIALPRICE:            `${BASE}/LocationMaterialPrice/UpdateLocationMaterialPrice`,
  DELETELOCATIONMATERIALPRICE:    `${BASE}/LocationMaterialPrice/DeleteLocationMaterialPrice`,

  // Plans / Estimation (Ollama-powered)
  GENERATE_PLAN:    `${BASE}/Plan/Generate2DPlan`,
  CALCULATEPRICE:   `${BASE}/Plan/CalculateMaterials`,

  // Enquiry
  ENQUIRY: `${BASE}/Enquiry`,

  // Projects
  PROJECTS:              `${BASE}/Project`,
  PROJECT_PHASES:        `${BASE}/Project/phases`,
  PROJECT_TASKS:         `${BASE}/Project/tasks`,
  PROJECT_AI_PLAN:       `${BASE}/Project/GenerateAIPlan`,

  // Risk Management
  RISKS:             `${BASE}/Risk`,
  RISK_BY_PROJECT:   `${BASE}/Risk/project`,
  RISK_AI_ASSESS:    `${BASE}/Risk/AIAssess`,
  RISK_AI_SAVE:      `${BASE}/Risk/AIAssessAndSave`,

  // Cost Estimation
  COST_ESTIMATES:         `${BASE}/Estimation`,
  COST_BY_PROJECT:        `${BASE}/Estimation/project`,
  COST_AI_ESTIMATE:       `${BASE}/Estimation/AIEstimate`,
  COST_AI_SAVE:           `${BASE}/Estimation/AIEstimateAndSave`,

  // AI Assistant (Ollama)
  AI_CHAT:         `${BASE}/AIAssistant/chat`,
  AI_QUICK_ADVICE: `${BASE}/AIAssistant/quickadvice`,
  AI_OLLAMA_HEALTH:`${BASE}/AIAssistant/health`,

  // Supplier Master
  SUPPLIERS:            `${BASE}/Supplier`,
  SUPPLIER_ACTIVE:      `${BASE}/Supplier/active`,
  SUPPLIER_CATEGORIES:  `${BASE}/Supplier/categories`,
  SUPPLIER_BY_CATEGORY: `${BASE}/Supplier/category`,
  SUPPLIER_RATE:        `${BASE}/Supplier`,

  // Quotation / RFQ
  QUOTATIONS:            `${BASE}/Quotation`,
  QUOTATION_SEND:        `${BASE}/Quotation/send`,
  QUOTATION_RESPONSE:    `${BASE}/Quotation/response`,
  QUOTATION_SELECT:      `${BASE}/Quotation/select`,

  // Payment / Subscription
  PAYMENT_PLANS:         `${BASE}/Payment/plans`,
  PAYMENT_STATUS:        `${BASE}/Payment/status`,
  PAYMENT_CREATE_ORDER:  `${BASE}/Payment/create-order`,
  PAYMENT_VERIFY:        `${BASE}/Payment/verify`,

  // Auth extras
  FORGOT_PASSWORD:       `${BASE}/Login/forgot-password`,
  RESET_PASSWORD:        `${BASE}/Login/reset-password`,

  // OTP
  OTP_SEND:    `${BASE}/Otp/send`,
  OTP_VERIFY:  `${BASE}/Otp/verify`,
  OTP_CONFIG:  `${BASE}/Otp/config`,

  // Supplier Portal
  SUPPLIER_PORTAL_REGISTER: `${BASE}/SupplierPortal/register`,
  SUPPLIER_PORTAL_LOGIN:    `${BASE}/SupplierPortal/login`,
  SUPPLIER_PORTAL_PROFILE:  `${BASE}/SupplierPortal/profile`,
  SUPPLIER_PORTAL_RFQS:     `${BASE}/SupplierPortal/rfqs`,

  // Floor Plan Designer
  FLOOR_PLANS:             `${BASE}/FloorPlan`,

  // Notifications
  NOTIFICATIONS:           `${BASE}/Notification`,
  NOTIFICATIONS_UNREAD:    `${BASE}/Notification/unread-count`,
  NOTIFICATIONS_MARK_READ: `${BASE}/Notification/mark-all-read`,

  // Project Documents
  PROJECT_DOCUMENTS:       `${BASE}/ProjectDocument`,
};
