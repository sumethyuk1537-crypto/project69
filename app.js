// Executive Dashboard Logic - Klongkhlung Ratsadon Rangsan School

const SPREADSHEET_URL = window.location.protocol === 'file:' ? 'http://localhost:8000/api/data' : '/api/data';

// State Management
let rawProjects = [];
let filteredProjects = [];
let departmentsList = [];

const filters = {
  search: "",
  dept: "all",
  status: "all"
};

const pagination = {
  currentPage: 1,
  pageSize: 5 // set to 5 to demonstrate pagination with 6 items
};

// Chart instances
let chartStatus = null;
let chartDept = null;
let chartProgress = null;

// DOM Elements
const syncText = document.getElementById("sync-text");
const btnRefresh = document.getElementById("btn-refresh");
const refreshIcon = document.getElementById("refresh-icon");
const btnTheme = document.getElementById("btn-theme");
const themeIcon = document.getElementById("theme-icon");

// KPI Elements
const kpiTotalProjects = document.getElementById("kpi-total-projects");
const kpiTotalBudget = document.getElementById("kpi-total-budget");
const kpiTotalSpent = document.getElementById("kpi-total-spent");
const kpiTotalRemaining = document.getElementById("kpi-total-remaining");
const kpiSpentSub = document.getElementById("kpi-spent-sub");
const kpiRemainingSub = document.getElementById("kpi-remaining-sub");

// Status Counts Elements
const statusCompletedCount = document.getElementById("status-completed-count");
const statusInProgressCount = document.getElementById("status-in-progress-count");
const statusNotStartedCount = document.getElementById("status-not-started-count");

// Search and Filter Elements
const searchInput = document.getElementById("search-input");
const filterDept = document.getElementById("filter-dept");
const filterStatus = document.getElementById("filter-status");

// Table Elements
const tableBody = document.getElementById("table-body");
const paginationInfo = document.getElementById("pagination-info");
const btnFirst = document.getElementById("btn-first");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnLast = document.getElementById("btn-last");

// Drawer Elements
const drawerOverlay = document.getElementById("drawer-overlay");
const projectDrawer = document.getElementById("project-drawer");
const drawerClose = document.getElementById("drawer-close");
const drawerProjectId = document.getElementById("drawer-project-id");
const drawerProjectName = document.getElementById("drawer-project-name");
const drawerProjectDept = document.getElementById("drawer-project-dept");
const drawerProjectManager = document.getElementById("drawer-project-manager");
const drawerProjectStatus = document.getElementById("drawer-project-status");
const drawerProgressText = document.getElementById("drawer-progress-text");
const drawerProgressFill = document.getElementById("drawer-progress-fill");
const drawerBudgetTotal = document.getElementById("drawer-budget-total");
const drawerBudgetSpent = document.getElementById("drawer-budget-spent");
const drawerBudgetRemaining = document.getElementById("drawer-budget-remaining");
const drawerBudgetRatio = document.getElementById("drawer-budget-ratio");

// Modal Elements
const btnAddProject = document.getElementById("btn-add-project");
const modalOverlay = document.getElementById("modal-overlay");
const addProjectModal = document.getElementById("add-project-modal");
const modalClose = document.getElementById("modal-close");
const btnModalCancel = document.getElementById("btn-modal-cancel");
const addProjectForm = document.getElementById("add-project-form");
const formProjectId = document.getElementById("form-project-id");
const formProjectName = document.getElementById("form-project-name");
const formProjectManager = document.getElementById("form-project-manager");
const formProjectDept = document.getElementById("form-project-dept");
const formProjectBudget = document.getElementById("form-project-budget");
const formProjectSpent = document.getElementById("form-project-spent");
const formProjectProgress = document.getElementById("form-project-progress");
const formProgressVal = document.getElementById("form-progress-val");
const formProjectStatus = document.getElementById("form-project-status");
const btnModalSubmit = document.getElementById("btn-modal-submit");

// Helper: Parse CSV
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const row = [];
    let insideQuote = false;
    let entry = "";
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        row.push(entry.trim());
        entry = "";
      } else {
        entry += char;
      }
    }
    row.push(entry.trim());
    
    // Clean outer quotes from cells
    const cleanRow = row.map(cell => {
      let c = cell;
      if (c.startsWith('"') && c.endsWith('"')) {
        c = c.substring(1, c.length - 1);
      }
      return c.trim();
    });
    
    result.push(cleanRow);
  }
  return result;
}

// Helper: Parse numbers securely
function parseNumber(val) {
  if (!val) return 0;
  const clean = val.replace(/,/g, '').trim();
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// Helper: Format Thai Currency
function formatCurrency(num) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 0 }).format(num);
}

// Helper: Format Percentage
function formatPercent(num) {
  return new Intl.NumberFormat('th-TH', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num / 100);
}

// Check Dark Mode
function isDarkMode() {
  return document.documentElement.classList.contains("dark");
}

// Fetch Google Sheets Data
async function loadData() {
  setLoadingState(true);
  try {
    const separator = SPREADSHEET_URL.includes('?') ? '&' : '?';
    const urlWithCacheBuster = `${SPREADSHEET_URL}${separator}t=${Date.now()}`;
    const response = await fetch(urlWithCacheBuster);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvText = await response.text();
    const rows = parseCSV(csvText);
    
    if (rows.length < 2) {
      throw new Error("No data rows found in the CSV");
    }
    
    processProjectsData(rows);
    updateUI();
    setSyncTime(true);
    
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    syncText.textContent = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
    setLoadingState(false);
  }
}

// Parse Google Sheet rows into javascript objects
function processProjectsData(rows) {
  const headers = rows[0];
  
  // Helper to dynamically find header index to make columns robust to shuffling
  const getIndex = (keywords, defaultIdx) => {
    const idx = headers.findIndex(h => keywords.some(k => h.toLowerCase().includes(k.toLowerCase())));
    return idx !== -1 ? idx : defaultIdx;
  };

  const idxId = getIndex(["รหัส"], 0);
  const idxName = getIndex(["ชื่อ"], 1);
  const idxManager = getIndex(["ผู้รับผิดชอบ"], 2);
  const idxDept = getIndex(["กลุ่มงาน"], 3);
  const idxBudget = getIndex(["งบประมาณ"], 4);
  const idxSpent = getIndex(["ใช้ไป"], 5);
  const idxRemaining = getIndex(["คงเหลือ"], 6);
  const idxProgress = getIndex(["ความคืบหน้า"], 7);
  const idxStatus = getIndex(["สถานะ"], 8);

  rawProjects = [];
  const deptsSet = new Set();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < headers.length) continue; // skip broken rows
    
    const id = row[idxId];
    const name = row[idxName];
    if (!name) continue; // skip rows without name
    
    const manager = row[idxManager] || "ไม่ระบุ";
    const dept = row[idxDept] || "อื่นๆ";
    deptsSet.add(dept);
    
    const budget = parseNumber(row[idxBudget]);
    const spent = parseNumber(row[idxSpent]);
    
    // If remaining field is empty, compute it, else parse
    let remaining = row[idxRemaining] ? parseNumber(row[idxRemaining]) : (budget - spent);
    if (!row[idxRemaining]) {
      remaining = budget - spent;
    }
    
    const progress = parseNumber(row[idxProgress]);
    const status = row[idxStatus] || "ยังไม่ดำเนินการ";
    
    rawProjects.push({
      id,
      name,
      manager,
      dept,
      budget,
      spent,
      remaining,
      progress,
      status
    });
  }
  
  departmentsList = Array.from(deptsSet).sort();
  
  // Initialize dynamic department filter
  populateDeptFilter();
}

function populateDeptFilter() {
  // Clear previous options except "all"
  filterDept.innerHTML = '<option value="all">ทุกกลุ่มงาน</option>';
  departmentsList.forEach(dept => {
    const option = document.createElement("option");
    option.value = dept;
    option.textContent = dept;
    filterDept.appendChild(option);
  });
  
  // Restore filter selection if it exists in the active state
  filterDept.value = filters.dept;
}

// UI State Toggles
function setLoadingState(isLoading) {
  if (isLoading) {
    btnRefresh.disabled = true;
    refreshIcon.classList.add("spin");
    syncText.textContent = "กำลังโหลดข้อมูลจาก Google Sheets...";
  } else {
    btnRefresh.disabled = false;
    refreshIcon.classList.remove("spin");
  }
}

function setSyncTime(success) {
  setLoadingState(false);
  if (success) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    syncText.textContent = `เชื่อมต่อแล้วล่าสุดเมื่อ ${timeStr}`;
  }
}

// Calculate Summaries & Render UI Components
function updateUI() {
  applyFilters();
  renderKPIs();
  renderStatusCounters();
  renderTable();
  renderCharts();
  
  // Re-trigger Lucide Icons rendering
  if (window.lucide) {
    lucide.createIcons();
  }
}

function applyFilters() {
  filteredProjects = rawProjects.filter(project => {
    // 1. Search Query Match
    const searchMatch = !filters.search || 
      project.name.toLowerCase().includes(filters.search.toLowerCase()) ||
      project.manager.toLowerCase().includes(filters.search.toLowerCase()) ||
      project.id.toLowerCase().includes(filters.search.toLowerCase());
      
    // 2. Department Match
    const deptMatch = filters.dept === "all" || project.dept === filters.dept;
    
    // 3. Status Match
    const statusMatch = filters.status === "all" || project.status === filters.status;
    
    return searchMatch && deptMatch && statusMatch;
  });
  
  // Reset pagination to page 1 on filter
  pagination.currentPage = 1;
}

function renderKPIs() {
  const totalProjects = filteredProjects.length;
  
  let totalBudget = 0;
  let totalSpent = 0;
  let totalRemaining = 0;
  
  filteredProjects.forEach(p => {
    totalBudget += p.budget;
    totalSpent += p.spent;
    totalRemaining += p.remaining;
  });
  
  // Update KPI Card Texts
  kpiTotalProjects.textContent = totalProjects.toLocaleString('th-TH');
  kpiTotalBudget.textContent = formatCurrency(totalBudget);
  kpiTotalSpent.textContent = formatCurrency(totalSpent);
  kpiTotalRemaining.textContent = formatCurrency(totalRemaining);
  
  // Spent Ratio
  const spentRatio = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  kpiSpentSub.innerHTML = `
    <span class="kpi-trend ${spentRatio > 0 ? 'positive' : 'neutral'}">
      ${spentRatio.toFixed(1)}%
    </span>
    <span>ของงบประมาณทั้งหมด</span>
  `;

  // Remaining Ratio
  const remainingRatio = totalBudget > 0 ? (totalRemaining / totalBudget) * 100 : 0;
  kpiRemainingSub.innerHTML = `
    <span class="kpi-trend positive">
      ${remainingRatio.toFixed(1)}%
    </span>
    <span>จากงบประมาณจัดสรร</span>
  `;
}

function renderStatusCounters() {
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  
  filteredProjects.forEach(p => {
    if (p.status === "ดำเนินการแล้ว") completed++;
    else if (p.status === "อยู่ระหว่างดำเนินการ") inProgress++;
    else notStarted++;
  });
  
  statusCompletedCount.textContent = completed;
  statusInProgressCount.textContent = inProgress;
  statusNotStartedCount.textContent = notStarted;
}

// Table Render with Pagination
function renderTable() {
  const startIndex = (pagination.currentPage - 1) * pagination.pageSize;
  const endIndex = Math.min(startIndex + pagination.pageSize, filteredProjects.length);
  const pageItems = filteredProjects.slice(startIndex, endIndex);
  
  tableBody.innerHTML = "";
  
  if (filteredProjects.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          ไม่พบโครงการตามเงื่อนไขการค้นหา
        </td>
      </tr>
    `;
    updatePaginationControls();
    return;
  }
  
  pageItems.forEach(p => {
    const tr = document.createElement("tr");
    tr.dataset.id = p.id;
    
    // Status color badge
    let statusClass = "not-started";
    if (p.status === "ดำเนินการแล้ว") statusClass = "completed";
    else if (p.status === "อยู่ระหว่างดำเนินการ") statusClass = "in-progress";
    
    // Progress fill color based on status
    let progressColor = "var(--accent-primary)";
    if (p.status === "ดำเนินการแล้ว") progressColor = "var(--success)";
    else if (p.status === "อยู่ระหว่างดำเนินการ") progressColor = "var(--warning)";
    else progressColor = "var(--text-muted)";

    tr.innerHTML = `
      <td style="font-family: 'JetBrains Mono', monospace; font-weight: 500;">${p.id}</td>
      <td style="font-weight: 600; color: var(--text-primary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</td>
      <td>${p.dept}</td>
      <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">${p.budget.toLocaleString('th-TH')}</td>
      <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">${p.spent.toLocaleString('th-TH')}</td>
      <td style="text-align: right; font-family: 'JetBrains Mono', monospace;">${p.remaining.toLocaleString('th-TH')}</td>
      <td class="progress-column">
        <div class="progress-bar-wrapper">
          <div class="progress-track">
            <div class="progress-fill" style="width: ${p.progress}%; background: ${progressColor}"></div>
          </div>
          <span class="progress-percent">${p.progress}%</span>
        </div>
      </td>
      <td style="text-align: center;">
        <span class="status-badge ${statusClass}">${p.status}</span>
      </td>
      <td style="color: var(--text-muted); font-size: 0.85rem;">${p.manager}</td>
    `;
    
    tr.addEventListener("click", () => showProjectDetails(p.id));
    tableBody.appendChild(tr);
  });
  
  updatePaginationControls();
}

function updatePaginationControls() {
  const total = filteredProjects.length;
  const totalPages = Math.ceil(total / pagination.pageSize) || 1;
  const start = total === 0 ? 0 : (pagination.currentPage - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.currentPage * pagination.pageSize, total);
  
  paginationInfo.textContent = `แสดงรายการที่ ${start}-${end} จากทั้งหมด ${total} รายการ`;
  
  btnFirst.disabled = pagination.currentPage === 1;
  btnPrev.disabled = pagination.currentPage === 1;
  btnNext.disabled = pagination.currentPage === totalPages;
  btnLast.disabled = pagination.currentPage === totalPages;
}

// Side Drawer Detail View
function showProjectDetails(projectId) {
  const project = rawProjects.find(p => p.id === projectId);
  if (!project) return;
  
  // Highlight clicked row
  document.querySelectorAll("#table-body tr").forEach(row => {
    row.classList.remove("selected");
    if (row.dataset.id === projectId) {
      row.classList.add("selected");
    }
  });

  drawerProjectId.textContent = `PROJECT ID: ${project.id}`;
  drawerProjectName.textContent = project.name;
  drawerProjectDept.textContent = project.dept;
  drawerProjectManager.textContent = project.manager;
  drawerProjectStatus.textContent = project.status;
  
  // Badge Color
  drawerProjectStatus.className = "detail-row-value status-badge";
  if (project.status === "ดำเนินการแล้ว") {
    drawerProjectStatus.classList.add("completed");
  } else if (project.status === "อยู่ระหว่างดำเนินการ") {
    drawerProjectStatus.classList.add("in-progress");
  } else {
    drawerProjectStatus.classList.add("not-started");
  }

  drawerProgressText.textContent = `${project.progress}%`;
  drawerProgressFill.style.width = `${project.progress}%`;
  
  // Fill color based on status
  if (project.status === "ดำเนินการแล้ว") {
    drawerProgressFill.style.backgroundColor = "var(--success)";
  } else if (project.status === "อยู่ระหว่างดำเนินการ") {
    drawerProgressFill.style.backgroundColor = "var(--warning)";
  } else {
    drawerProgressFill.style.backgroundColor = "var(--text-muted)";
  }

  drawerBudgetTotal.textContent = formatCurrency(project.budget);
  drawerBudgetSpent.textContent = formatCurrency(project.spent);
  drawerBudgetRemaining.textContent = formatCurrency(project.remaining);
  
  const ratio = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
  drawerBudgetRatio.textContent = `${ratio.toFixed(1)}%`;
  
  // Open drawer
  drawerOverlay.classList.add("active");
  projectDrawer.classList.add("active");
}

function closeProjectDetails() {
  drawerOverlay.classList.remove("active");
  projectDrawer.classList.remove("active");
  document.querySelectorAll("#table-body tr").forEach(row => row.classList.remove("selected"));
}

function openAddProjectModal() {
  // Auto-calculate next ID
  const ids = rawProjects.map(p => parseInt(p.id)).filter(id => !isNaN(id));
  const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  formProjectId.value = nextId;

  // Reset form fields
  formProjectName.value = "";
  formProjectManager.value = "";
  formProjectDept.value = "วิชาการ";
  formProjectBudget.value = 0;
  formProjectSpent.value = 0;
  formProjectProgress.value = 0;
  formProgressVal.textContent = "0%";
  formProjectStatus.value = "ยังไม่ดำเนินการ";

  modalOverlay.classList.add("active");
  addProjectModal.classList.add("active");
}

function closeAddProjectModal() {
  modalOverlay.classList.remove("active");
  addProjectModal.classList.remove("active");
}

async function submitAddProjectForm(e) {
  e.preventDefault();

  const projectData = {
    id: formProjectId.value.trim(),
    name: formProjectName.value.trim(),
    manager: formProjectManager.value.trim(),
    dept: formProjectDept.value,
    budget: parseFloat(formProjectBudget.value) || 0,
    spent: parseFloat(formProjectSpent.value) || 0,
    progress: parseInt(formProjectProgress.value) || 0,
    status: formProjectStatus.value
  };

  if (!projectData.name || !projectData.manager) {
    alert("กรุณากรอกข้อมูลให้ครบถ้วน");
    return;
  }

  btnModalSubmit.disabled = true;
  btnModalSubmit.innerHTML = '<span>กำลังบันทึก...</span>';

  const postUrl = window.location.protocol === 'file:' ? 'http://localhost:8000/api/add' : '/api/add';
  
  try {
    const response = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.status === 'success') {
      closeAddProjectModal();
      await loadData();
    } else {
      alert("เกิดข้อผิดพลาดในการบันทึก: " + result.message);
    }
  } catch (err) {
    console.error("Error saving project:", err);
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: " + err.message);
  } finally {
    btnModalSubmit.disabled = false;
    btnModalSubmit.innerHTML = '<i data-lucide="save"></i><span>บันทึกโครงการ</span>';
    if (window.lucide) lucide.createIcons();
  }
}

// ECharts Chart Rendering
function renderCharts() {
  const isDark = isDarkMode();
  const themeText = isDark ? "#cbd5e1" : "#475569";
  const themeGrid = isDark ? "#27272a" : "#e2e8f0";
  const tooltipBg = isDark ? "rgba(15, 15, 20, 0.9)" : "rgba(255, 255, 255, 0.95)";
  const tooltipBorder = isDark ? "#3f3f46" : "#cbd5e1";
  const tooltipText = isDark ? "#f8fafc" : "#0f172a";

  const chartColors = ["#8b5cf6", "#a78bfa", "#c084fc", "#d8b4fe", "#e9d5ff", "#f3e8ff", "#3b82f6", "#10b981", "#f59e0b", "#ef4444"];

  // 1. Chart Status (Pie Chart)
  if (!chartStatus) {
    chartStatus = echarts.init(document.getElementById("chart-status"));
  }
  
  // Calculate status statistics
  let statusStats = { "ดำเนินการแล้ว": 0, "อยู่ระหว่างดำเนินการ": 0, "ยังไม่ดำเนินการ": 0 };
  filteredProjects.forEach(p => {
    if (statusStats[p.status] !== undefined) statusStats[p.status]++;
  });
  
  const statusData = [
    { value: statusStats["ดำเนินการแล้ว"], name: "ดำเนินการแล้ว", itemStyle: { color: "#10b981" } },
    { value: statusStats["อยู่ระหว่างดำเนินการ"], name: "อยู่ระหว่างดำเนินการ", itemStyle: { color: "#f59e0b" } },
    { value: statusStats["ยังไม่ดำเนินการ"], name: "ยังไม่ดำเนินการ", itemStyle: { color: "#8b5cf6" } }
  ].filter(item => item.value > 0);

  chartStatus.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontFamily: 'Inter, sans-serif' }
    },
    legend: {
      orient: 'horizontal',
      bottom: 'bottom',
      textStyle: { color: themeText, fontFamily: 'Inter, sans-serif' }
    },
    series: [
      {
        name: 'สถานะโครงการ',
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 8,
          borderColor: isDark ? '#0f0f14' : '#ffffff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}: {c} ({d}%)',
          color: themeText,
          fontFamily: 'Inter, sans-serif'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: '14',
            fontWeight: 'bold'
          }
        },
        data: statusData
      }
    ]
  }, true);

  // 2. Chart Budget by Department (Bar Chart)
  if (!chartDept) {
    chartDept = echarts.init(document.getElementById("chart-department"));
  }

  // Calculate budgets by department
  const deptBudgets = {};
  filteredProjects.forEach(p => {
    if (!deptBudgets[p.dept]) {
      deptBudgets[p.dept] = { budget: 0, spent: 0 };
    }
    deptBudgets[p.dept].budget += p.budget;
    deptBudgets[p.dept].spent += p.spent;
  });

  const deptCategories = Object.keys(deptBudgets).sort();
  const deptBudgetData = deptCategories.map(d => deptBudgets[d].budget);
  const deptSpentData = deptCategories.map(d => deptBudgets[d].spent);

  chartDept.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontFamily: 'Inter, sans-serif' }
    },
    legend: {
      textStyle: { color: themeText, fontFamily: 'Inter, sans-serif' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: themeText, fontFamily: 'Inter, sans-serif' },
      splitLine: { lineStyle: { color: themeGrid } }
    },
    yAxis: {
      type: 'category',
      data: deptCategories,
      axisLabel: { color: themeText, fontFamily: 'Outfit, sans-serif', fontSize: 11 }
    },
    series: [
      {
        name: 'งบประมาณโครงการ',
        type: 'bar',
        data: deptBudgetData,
        itemStyle: { color: '#8b5cf6', borderRadius: [0, 4, 4, 0] }
      },
      {
        name: 'งบประมาณที่ใช้ไป',
        type: 'bar',
        data: deptSpentData,
        itemStyle: { color: '#f59e0b', borderRadius: [0, 4, 4, 0] }
      }
    ]
  }, true);

  // 3. Chart Progress by Project (Bar Chart)
  if (!chartProgress) {
    chartProgress = echarts.init(document.getElementById("chart-progress"));
  }

  // Sort filtered projects by ID or Name
  const projectListSorted = [...filteredProjects].sort((a, b) => parseInt(a.id) - parseInt(b.id));
  const projectNames = projectListSorted.map(p => `[ID:${p.id}] ${p.name.substring(0, 20)}${p.name.length > 20 ? '...' : ''}`);
  const projectProgressValues = projectListSorted.map(p => p.progress);
  
  // Custom colors for bars based on status
  const projectColors = projectListSorted.map(p => {
    if (p.status === "ดำเนินการแล้ว") return "#10b981";
    if (p.status === "อยู่ระหว่างดำเนินการ") return "#f59e0b";
    return "#a78bfa";
  });

  chartProgress.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontFamily: 'Inter, sans-serif' },
      formatter: function(params) {
        const item = projectListSorted[params[0].dataIndex];
        return `
          <div style="font-family: Inter, sans-serif;">
            <b style="color: ${themeText}">[ID: ${item.id}] ${item.name}</b><br/>
            ความคืบหน้า: <b>${item.progress}%</b> (${item.status})<br/>
            กลุ่มงาน: ${item.dept}<br/>
            งบประมาณ: <b>${formatCurrency(item.budget)}</b>
          </div>
        `;
      }
    },
    grid: {
      left: '3%',
      right: '8%',
      bottom: '3%',
      top: '5%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%', color: themeText, fontFamily: 'Inter, sans-serif' },
      splitLine: { lineStyle: { color: themeGrid } }
    },
    yAxis: {
      type: 'category',
      data: projectNames,
      axisLabel: { color: themeText, fontFamily: 'Outfit, sans-serif', fontSize: 11 }
    },
    series: [
      {
        name: 'ความคืบหน้า',
        type: 'bar',
        data: projectProgressValues,
        itemStyle: {
          color: function(param) {
            return projectColors[param.dataIndex];
          },
          borderRadius: [0, 4, 4, 0]
        },
        label: {
          show: true,
          position: 'right',
          formatter: '{c}%',
          color: themeText,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10
        }
      }
    ]
  }, true);
}

// Global Event Listeners
function initEventListeners() {
  
  // Add Project Button
  btnAddProject.addEventListener("click", openAddProjectModal);

  // Modal Close Buttons
  modalClose.addEventListener("click", closeAddProjectModal);
  btnModalCancel.addEventListener("click", closeAddProjectModal);
  modalOverlay.addEventListener("click", closeAddProjectModal);

  // Form Submit
  addProjectForm.addEventListener("submit", submitAddProjectForm);

  // Progress slider label update
  formProjectProgress.addEventListener("input", (e) => {
    formProgressVal.textContent = `${e.target.value}%`;
  });

  // Refresh Button
  btnRefresh.addEventListener("click", () => {
    closeProjectDetails();
    closeAddProjectModal();
    loadData();
  });
  
  // Theme Toggle Button
  btnTheme.addEventListener("click", () => {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    
    // Update theme icon
    themeIcon.setAttribute("data-lucide", isDark ? "sun" : "moon");
    if (window.lucide) {
      lucide.createIcons();
    }
    
    // Redraw charts with updated colors
    setTimeout(renderCharts, 100);
  });
  
  // Search Input
  searchInput.addEventListener("input", (e) => {
    filters.search = e.target.value.trim();
    updateUI();
  });
  
  // Department Filter
  filterDept.addEventListener("change", (e) => {
    filters.dept = e.target.value;
    updateUI();
  });
  
  // Status Filter
  filterStatus.addEventListener("change", (e) => {
    filters.status = e.target.value;
    updateUI();
  });
  
  // Drawer Close
  drawerClose.addEventListener("click", closeProjectDetails);
  drawerOverlay.addEventListener("click", closeProjectDetails);
  
  // Escape key closes drawer and modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeProjectDetails();
      closeAddProjectModal();
    }
  });
  
  // Pagination buttons
  btnFirst.addEventListener("click", () => {
    pagination.currentPage = 1;
    renderTable();
  });
  
  btnPrev.addEventListener("click", () => {
    if (pagination.currentPage > 1) {
      pagination.currentPage--;
      renderTable();
    }
  });
  
  btnNext.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredProjects.length / pagination.pageSize);
    if (pagination.currentPage < totalPages) {
      pagination.currentPage++;
      renderTable();
    }
  });
  
  btnLast.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredProjects.length / pagination.pageSize);
    pagination.currentPage = totalPages;
    renderTable();
  });
  
  // Resize handler for ECharts
  window.addEventListener("resize", () => {
    if (chartStatus) chartStatus.resize();
    if (chartDept) chartDept.resize();
    if (chartProgress) chartProgress.resize();
  });
}

// Theme initialization
function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  
  const setDark = savedTheme === "dark" || (!savedTheme && systemPrefersDark);
  
  if (setDark) {
    document.documentElement.classList.add("dark");
    themeIcon.setAttribute("data-lucide", "sun");
  } else {
    document.documentElement.classList.remove("dark");
    themeIcon.setAttribute("data-lucide", "moon");
  }
}

// App Entry Point
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initEventListeners();
  loadData();
});
