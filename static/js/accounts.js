/**
 * 账号管理页面 JavaScript
 * 使用 utils.js 中的工具库
 */

// 状态
let currentPage = 1;
let pageSize = 20;
let totalAccounts = 0;
let selectedAccounts = new Set();
let isLoading = false;
let selectAllPages = false;  // 是否选中了全部页
let currentFilters = { status: '', email_service: '', search: '' };  // 当前筛选条件

// DOM 元素
const elements = {
    table: document.getElementById('accounts-table'),
    totalAccounts: document.getElementById('total-accounts'),
    activeAccounts: document.getElementById('active-accounts'),
    expiredAccounts: document.getElementById('expired-accounts'),
    bannedAccounts: document.getElementById('banned-accounts'),
    failedAccounts: document.getElementById('failed-accounts'), // 对应“失效”
    filterStatus: document.getElementById('filter-status'),
    filterService: document.getElementById('filter-service'),
    filterCpaToggle: document.getElementById('filter-cpa-toggle'),
    searchInput: document.getElementById('search-email'),
    refreshBtn: document.getElementById('refresh-btn'),
    batchRefreshBtn: document.getElementById('batch-refresh-btn'),
    batchValidateBtn: document.getElementById('batch-validate-btn'),
    batchUploadBtn: document.getElementById('batch-upload-btn'),
    batchDeleteBtn: document.getElementById('batch-delete-btn'),
    selectAll: document.getElementById('select-all'),
    paginationContainer: document.getElementById('pagination-container'),
    detailModal: document.getElementById('detail-modal'),
    modalBody: document.getElementById('modal-body'),
    closeModal: document.getElementById('close-modal')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadAccounts();
    loadFilterServices();
    initEventListeners();
    updateBatchButtons();  // 初始化按钮状态
    renderSelectAllBanner();

    // 自动刷新统计 (加速到 5 秒)
    setInterval(loadStats, 5000);
});

// 事件监听
function initEventListeners() {
    // 模态框关闭
    if (elements.closeModal) {
        elements.closeModal.onclick = () => elements.detailModal.classList.remove('active');
    }

    // 点击遮罩层关闭模态框
    elements.detailModal.onclick = (e) => {
        if (e.target === elements.detailModal) {
            elements.detailModal.classList.remove('active');
        }
    };

    // 筛选
    elements.filterStatus.addEventListener('change', () => {
        currentPage = 1;
        resetSelectAllPages();
        loadAccounts();
    });

    elements.filterService.addEventListener('change', () => {
        currentPage = 1;
        resetSelectAllPages();
        loadAccounts();
    });

    elements.filterCpaToggle.addEventListener('change', () => {
        currentPage = 1;
        resetSelectAllPages();
        loadAccounts();
    });

    // 搜索（防抖）
    elements.searchInput.addEventListener('input', debounce(() => {
        currentPage = 1;
        resetSelectAllPages();
        loadAccounts();
    }, 300));

    // 快捷键聚焦搜索
    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            elements.searchInput.blur();
            elements.searchInput.value = '';
            resetSelectAllPages();
            loadAccounts();
        }
    });

    // 刷新
    elements.refreshBtn.addEventListener('click', () => {
        loadStats();
        loadAccounts();
        toast.info('已刷新');
    });

    // 批量刷新 Token
    elements.batchRefreshBtn.addEventListener('click', handleBatchRefresh);

    // 批量验证 Token
    elements.batchValidateBtn.addEventListener('click', handleBatchValidate);

    // 批量上传至 CPA（直接触发，无需下拉菜单）
    elements.batchUploadBtn.addEventListener('click', () => {
        handleBatchUploadCpa();
    });

    // 批量删除
    elements.batchDeleteBtn.addEventListener('click', handleBatchDelete);

    // 全选（当前页）
    elements.selectAll.addEventListener('click', (e) => {
        const isChecked = e.target.checked;
        const checkboxes = elements.table.querySelectorAll('input[type="checkbox"][data-id]');

        checkboxes.forEach(cb => {
            cb.checked = isChecked;
            const id = parseInt(cb.dataset.id);
            if (isChecked) {
                selectedAccounts.add(id);
            } else {
                selectedAccounts.delete(id);
            }
        });

        if (!isChecked) {
            selectAllPages = false;
        }

        updateBatchButtons();
        renderSelectAllBanner();
    });

    // 关闭模态框
    elements.closeModal.addEventListener('click', () => {
        elements.detailModal.classList.remove('active');
    });

    elements.detailModal.addEventListener('click', (e) => {
        if (e.target === elements.detailModal) {
            elements.detailModal.classList.remove('active');
        }
    });

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        document.querySelectorAll('#accounts-table .dropdown-menu.active').forEach(m => m.classList.remove('active'));
    });
}

// 加载统计信息
async function loadStats() {
    try {
        const data = await api.get('/accounts/stats/summary');

        elements.totalAccounts.textContent = format.number(data.total || 0);
        elements.activeAccounts.textContent = format.number(data.by_status?.active || 0);
        elements.expiredAccounts.textContent = format.number(data.by_status?.expired || 0);
        elements.bannedAccounts.textContent = format.number(data.by_status?.banned || 0);
        elements.failedAccounts.textContent = format.number(data.by_status?.failed || 0);

        // 添加动画效果
        animateValue(elements.totalAccounts, data.total || 0);
    } catch (error) {
        console.error('加载统计信息失败:', error);
    }
}

// 数字动画
function animateValue(element, value) {
    element.style.transition = 'transform 0.2s ease';
    element.style.transform = 'scale(1.1)';
    setTimeout(() => {
        element.style.transform = 'scale(1)';
    }, 200);
}

// 加载账号列表
async function loadAccounts() {
    if (isLoading) return;
    isLoading = true;
    elements.table.classList.add('loading');

    try {
        const status = elements.filterStatus.value;
        const service = elements.filterService.value;
        const filterUnuploaded = elements.filterCpaToggle.checked;
        const search = elements.searchInput.value.trim();

        let url = `/accounts?page=${currentPage}&page_size=${pageSize}`;
        if (status) url += `&status=${status}`;
        if (service) url += `&email_service=${service}`;
        if (filterUnuploaded) url += `&cpa_uploaded=false`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const data = await api.get(url);

        totalAccounts = data.total;
        renderAccounts(data.accounts); // 后端返回的是 accounts 字段
        updatePagination();
    } catch (error) {
        console.error('加载账号列表失败:', error);
        toast.error('加载账号列表失败');
    } finally {
        isLoading = false;
        elements.table.classList.remove('loading');
    }
}

// 加载可用的过滤服务
async function loadFilterServices() {
    try {
        const stats = await api.get('/accounts/stats/summary');
        const services = Object.keys(stats.by_email_service || {});

        const select = elements.filterService;
        const currentValue = select.value;

        // 保留“所有服务”选项
        select.innerHTML = '<option value="">所有邮箱服务</option>';

        services.sort().forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = s.charAt(0).toUpperCase() + s.slice(1);
            select.appendChild(option);
        });

        select.value = currentValue;
    } catch (e) {
        console.warn('加载服务列表失败', e);
    }
}

// 更新统计数据（外部调用或主动更新）
function updateStats(stats) {
    if (!stats) return;
    elements.totalAccounts.textContent = format.number(totalAccounts || 0);
    elements.activeAccounts.textContent = format.number(stats.active || 0);
    elements.expiredAccounts.textContent = format.number(stats.expired || 0);
    elements.bannedAccounts.textContent = format.number(stats.banned || 0);
    elements.failedAccounts.textContent = format.number(stats.failed || 0);
}

// 渲染账号列表
function renderAccounts(accounts) {
    if (accounts.length === 0) {
        elements.table.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <div class="empty-state-title">暂无数据</div>
                        <div class="empty-state-description">没有找到符合条件的账号记录</div>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    elements.table.innerHTML = accounts.map(account => `
        <tr data-id="${account.id}">
            <td>
                <input type="checkbox" data-id="${account.id}"
                    ${selectedAccounts.has(account.id) ? 'checked' : ''}>
            </td>
            <td>${account.id}</td>
            <td>
                <span style="display:inline-flex;align-items:center;gap:4px;">
                    <span class="email-cell" title="${escapeHtml(account.email)}">${escapeHtml(account.email)}</span>
                    <button class="btn-copy-icon copy-email-btn" data-email="${escapeHtml(account.email)}" title="复制邮箱">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                </span>
            </td>
            <td class="password-cell">
                ${account.password
            ? `<span style="display:inline-flex;align-items:center;gap:8px;">
                        <span class="password-hidden">••••••••</span>
                        <button class="btn-copy-icon copy-pwd-btn" data-pwd="${escapeHtml(account.password)}" title="复制密码">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                       </span>`
            : '-'}
            </td>
            <td>${getServiceTypeText(account.email_service)}</td>
            <td>${getStatusIcon(account.status)}</td>
            <td>
                <div class="cpa-status">
                    ${account.cpa_uploaded
            ? `<span class="badge uploaded" title="已上传于 ${format.date(account.cpa_uploaded_at)}">√</span>`
            : `<span class="badge pending">-</span>`}
                </div>
            </td>
            <td>${format.date(account.last_refresh) || '-'}</td>
            <td>
                <div style="display:flex;gap:4px;align-items:center;white-space:nowrap;">
                    <button class="btn btn-secondary btn-sm" onclick="viewAccount(${account.id})">详情</button>
                    <div class="dropdown" style="position:relative;">
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();toggleMoreMenu(this)">更多</button>
                        <div class="dropdown-menu" style="min-width:100px;">
                            <a href="#" class="dropdown-item" onclick="event.preventDefault();closeMoreMenu(this);refreshToken(${account.id})">刷新 Token</a>
                            <a href="#" class="dropdown-item" onclick="event.preventDefault();closeMoreMenu(this);uploadAccount(${account.id})">上传 CPA</a>
                            <div class="dropdown-divider"></div>
                            <a href="#" class="dropdown-item danger" onclick="event.preventDefault();closeMoreMenu(this);deleteAccount(${account.id})">删除账号</a>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `).join('');

    // 绑定复选框事件
    elements.table.querySelectorAll('input[type="checkbox"][data-id]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            if (e.target.checked) {
                selectedAccounts.add(id);
            } else {
                selectedAccounts.delete(id);
                selectAllPages = false;
            }
            // 同步全选框状态
            const allChecked = elements.table.querySelectorAll('input[type="checkbox"][data-id]');
            const checkedCount = elements.table.querySelectorAll('input[type="checkbox"][data-id]:checked').length;
            elements.selectAll.checked = allChecked.length > 0 && checkedCount === allChecked.length;
            elements.selectAll.indeterminate = checkedCount > 0 && checkedCount < allChecked.length;
            updateBatchButtons();
            renderSelectAllBanner();
        });
    });

    // 绑定复制邮箱按钮
    elements.table.querySelectorAll('.copy-email-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(btn.dataset.email);
        });
    });

    elements.table.querySelectorAll('.copy-pwd-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(btn.dataset.pwd);
        });
    });

    // 渲染后同步全选框状态
    const allCbs = elements.table.querySelectorAll('input[type="checkbox"][data-id]');
    const checkedCbs = elements.table.querySelectorAll('input[type="checkbox"][data-id]:checked');
    elements.selectAll.checked = allCbs.length > 0 && checkedCbs.length === allCbs.length;
    elements.selectAll.indeterminate = checkedCbs.length > 0 && checkedCbs.length < allCbs.length;
    renderSelectAllBanner();
}

// 更新分页
function updatePagination() {
    const totalPages = Math.max(1, Math.ceil(totalAccounts / pageSize));
    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const container = elements.paginationContainer;
    container.innerHTML = '';

    if (totalAccounts === 0) return;

    // 前一页
    const prevBtn = document.createElement('button');
    prevBtn.className = `btn btn-secondary btn-sm ${currentPage <= 1 ? 'disabled' : ''}`;
    prevBtn.textContent = '前一页';
    prevBtn.style.margin = '0 4px';
    prevBtn.disabled = currentPage <= 1;
    prevBtn.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            loadAccounts();
        }
    };
    container.appendChild(prevBtn);

    // 页码系统
    if (totalPages > 1) {
        const maxVisible = 5;
        let start = Math.max(1, currentPage - 2);
        let end = Math.min(totalPages, start + maxVisible - 1);

        if (end - start + 1 < maxVisible) {
            start = Math.max(1, end - maxVisible + 1);
        }

        if (start > 1) {
            addPageBtn(1, container);
            if (start > 2) addEllipsis(container);
        }

        for (let i = start; i <= end; i++) {
            addPageBtn(i, container);
        }

        if (end < totalPages) {
            if (end < totalPages - 1) addEllipsis(container);
            addPageBtn(totalPages, container);
        }
    } else {
        addPageBtn(1, container);
    }

    // 后一页
    const nextBtn = document.createElement('button');
    nextBtn.className = `btn btn-secondary btn-sm ${currentPage >= totalPages ? 'disabled' : ''}`;
    nextBtn.textContent = '后一页';
    nextBtn.style.margin = '0 4px';
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            loadAccounts();
        }
    };
    container.appendChild(nextBtn);

    // 跳转到页码 (Apple Style)
    if (totalPages > 1) {
        const jumpDivider = document.createElement('div');
        jumpDivider.style.cssText = 'width: 1px; height: 16px; background: var(--border); margin: 0 12px;';
        container.appendChild(jumpDivider);

        const jumpWrapper = document.createElement('div');
        jumpWrapper.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary);';

        const jumpInput = document.createElement('input');
        jumpInput.type = 'number';
        jumpInput.min = 1;
        jumpInput.max = totalPages;
        jumpInput.value = currentPage;
        jumpInput.style.cssText = 'width: 48px; height: 28px; padding: 0 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); text-align: center; outline: none; transition: border-color 0.2s; font-size: 13px;';
        jumpInput.onfocus = () => jumpInput.style.borderColor = 'var(--primary-color)';
        jumpInput.onblur = () => jumpInput.style.borderColor = 'var(--border)';

        const jumpText = document.createElement('span');
        jumpText.textContent = `跳转至`;

        const jumpBtn = document.createElement('button');
        jumpBtn.className = 'btn btn-ghost btn-sm';
        jumpBtn.textContent = '确认';
        jumpBtn.style.padding = '2px 8px';
        jumpBtn.onclick = () => {
            const page = parseInt(jumpInput.value);
            if (page >= 1 && page <= totalPages && page !== currentPage) {
                currentPage = page;
                loadAccounts();
            }
        };

        jumpWrapper.appendChild(jumpText);
        jumpWrapper.appendChild(jumpInput);
        jumpWrapper.appendChild(jumpBtn);
        container.appendChild(jumpWrapper);

        // 回车跳转
        jumpInput.onkeydown = (e) => {
            if (e.key === 'Enter') jumpBtn.click();
        };
    }
}

function addPageBtn(page, container) {
    const btn = document.createElement('button');
    btn.className = `btn btn-sm ${page === currentPage ? 'btn-primary' : 'btn-ghost'}`;
    btn.textContent = page;
    btn.style.minWidth = '32px';
    btn.style.margin = '0 2px';
    btn.onclick = () => {
        if (page !== currentPage) {
            currentPage = page;
            loadAccounts();
        }
    };
    container.appendChild(btn);
}

function addEllipsis(container) {
    const span = document.createElement('span');
    span.textContent = '...';
    span.style.margin = '0 4px';
    span.style.color = 'var(--text-muted)';
    container.appendChild(span);
}

// 重置全选所有页状态
function resetSelectAllPages() {
    selectAllPages = false;
    selectedAccounts.clear();
    updateBatchButtons();
    renderSelectAllBanner();
}

// 构建批量请求体（含 select_all 和筛选参数）
function buildBatchPayload(extraFields = {}) {
    if (selectAllPages) {
        return {
            ids: [],
            select_all: true,
            status_filter: currentFilters.status || null,
            email_service_filter: currentFilters.email_service || null,
            search_filter: currentFilters.search || null,
            ...extraFields
        };
    }
    return { ids: Array.from(selectedAccounts), ...extraFields };
}

// 获取有效选中数量（select_all 时用总数）
function getEffectiveCount() {
    return selectAllPages ? totalAccounts : selectedAccounts.size;
}

// 渲染全选横幅
function renderSelectAllBanner() {
    let banner = document.getElementById('select-all-banner');
    const totalPages = Math.ceil(totalAccounts / pageSize);
    const currentPageSize = elements.table.querySelectorAll('input[type="checkbox"][data-id]').length;
    const checkedOnPage = elements.table.querySelectorAll('input[type="checkbox"][data-id]:checked').length;
    const allPageSelected = currentPageSize > 0 && checkedOnPage === currentPageSize;

    // 只在全选了当前页且有多页时显示横幅
    if (!allPageSelected || totalPages <= 1 || totalAccounts <= pageSize) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'select-all-banner';
        banner.style.cssText = 'background:var(--primary-light,#e8f0fe);color:var(--primary-color,#1a73e8);padding:8px 16px;text-align:center;font-size:0.875rem;border-bottom:1px solid var(--border-color);';
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) tableContainer.insertAdjacentElement('beforebegin', banner);
    }

    if (selectAllPages) {
        banner.innerHTML = `已选中全部 <strong>${totalAccounts}</strong> 条记录。<button onclick="resetSelectAllPages()" style="margin-left:8px;color:var(--primary-color,#1a73e8);background:none;border:none;cursor:pointer;text-decoration:underline;">取消全选</button>`;
    } else {
        banner.innerHTML = `当前页已全选 <strong>${checkedOnPage}</strong> 条。<button onclick="selectAllPagesAction()" style="margin-left:8px;color:var(--primary-color,#1a73e8);background:none;border:none;cursor:pointer;text-decoration:underline;">选择全部 ${totalAccounts} 条</button>`;
    }
}

// 选中所有页
function selectAllPagesAction() {
    selectAllPages = true;
    updateBatchButtons();
    renderSelectAllBanner();
}

// 更新批量操作按钮
function updateBatchButtons() {
    const count = getEffectiveCount();
    if (elements.batchDeleteBtn) {
        elements.batchDeleteBtn.disabled = count === 0;
        elements.batchDeleteBtn.textContent = count > 0 ? `删除 (${count})` : '批量删除';
    }
    if (elements.batchRefreshBtn) {
        elements.batchRefreshBtn.disabled = count === 0;
        elements.batchRefreshBtn.textContent = count > 0 ? `刷新 (${count})` : '刷新 Token';
    }
    if (elements.batchValidateBtn) {
        elements.batchValidateBtn.disabled = count === 0;
        elements.batchValidateBtn.textContent = count > 0 ? `验证 (${count})` : '验证 Token';
    }
    if (elements.batchUploadBtn) {
        elements.batchUploadBtn.disabled = count === 0;
        elements.batchUploadBtn.textContent = count > 0 ? `上传 (${count})` : '上传 CPA';
    }
}

// 刷新单个账号Token
async function refreshToken(id) {
    try {
        toast.info('正在刷新Token...');
        const result = await api.post(`/accounts/${id}/refresh`);

        if (result.success) {
            toast.success('Token刷新成功');
            loadAccounts();
        } else {
            toast.error('刷新失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        toast.error('刷新失败: ' + error.message);
    }
}

// 批量刷新Token
async function handleBatchRefresh() {
    const count = getEffectiveCount();
    if (count === 0) return;

    const confirmed = await confirm(`确定要刷新选中的 ${count} 个账号的Token吗？`);
    if (!confirmed) return;

    elements.batchRefreshBtn.disabled = true;
    elements.batchRefreshBtn.textContent = '刷新中...';

    try {
        const result = await api.post('/accounts/batch-refresh', buildBatchPayload());
        toast.success(`成功刷新 ${result.success_count} 个，失败 ${result.failed_count} 个`);
        loadAccounts();
    } catch (error) {
        toast.error('批量刷新失败: ' + error.message);
    } finally {
        updateBatchButtons();
    }
}

// 批量验证Token
async function handleBatchValidate() {
    if (getEffectiveCount() === 0) return;

    elements.batchValidateBtn.disabled = true;
    elements.batchValidateBtn.textContent = '验证中...';

    try {
        const result = await api.post('/accounts/batch-validate', buildBatchPayload());
        toast.info(`有效: ${result.valid_count}，无效: ${result.invalid_count}`);
        loadAccounts();
    } catch (error) {
        toast.error('批量验证失败: ' + error.message);
    } finally {
        updateBatchButtons();
    }
}

// 查看账号详情
async function viewAccount(id) {
    try {
        const account = await api.get(`/accounts/${id}`);
        const tokens = await api.get(`/accounts/${id}/tokens`);

        elements.modalBody.innerHTML = `
            <div class="info-grid">
                <div class="info-item" style="grid-column: span 2;">
                    <span class="label">邮箱</span>
                    <span class="value">
                        <strong style="font-size: 1.1rem;">${escapeHtml(account.email)}</strong>
                        <button class="btn btn-ghost btn-sm btn-icon" onclick="copyToClipboard('${escapeHtml(account.email)}')" title="复制邮箱">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </span>
                </div>
                
                <div class="info-item">
                    <span class="label">密码</span>
                    <span class="value">
                        ${account.password ? `<span class="password-hidden">••••••••</span>` : '-'}
                        ${account.password ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="copyToClipboard('${escapeHtml(account.password)}')" title="复制密码">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>` : ''}
                    </span>
                </div>
                
                <div class="info-item">
                    <span class="label">状态</span>
                    <span class="value">
                        <span class="badge ${statusMap.account[account.status]?.class || ''}">
                            ${statusMap.account[account.status]?.text || account.status}
                        </span>
                    </span>
                </div>

                <div class="info-item">
                    <span class="label">服务商</span>
                    <span class="value">${escapeHtml(account.email_service || '-')}</span>
                </div>
                
                <div class="info-item">
                    <span class="label">Account ID</span>
                    <span class="value">${account.account_id || '-'}</span>
                </div>

                <div class="info-item">
                    <span class="label">注册时间</span>
                    <span class="value">${format.date(account.registered_at)}</span>
                </div>

                <div class="info-item" style="grid-column: span 2;">
                    <span class="label">Client ID</span>
                    <div class="token-box">${escapeHtml(account.client_id || '未设置')}</div>
                </div>

                <div class="info-item" style="grid-column: span 2;">
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <span class="label">Access Token</span>
                        ${tokens.access_token ? `<button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${escapeHtml(tokens.access_token)}')">复制全部</button>` : ''}
                    </div>
                    <div class="token-box" style="color: var(--text-primary); cursor: pointer;" onclick="copyToClipboard('${escapeHtml(tokens.access_token || '')}')" title="点击复制">
                        ${escapeHtml(tokens.access_token || '无可用 Token')}
                    </div>
                </div>

                <div class="info-item" style="grid-column: span 2;">
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <span class="label">Refresh Token</span>
                        ${tokens.refresh_token ? `<button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${escapeHtml(tokens.refresh_token)}')">复制全部</button>` : ''}
                    </div>
                    <div class="token-box" style="color: var(--text-primary); cursor: pointer;" onclick="copyToClipboard('${escapeHtml(tokens.refresh_token || '')}')" title="点击复制">
                        ${escapeHtml(tokens.refresh_token || '无可用 Token')}
                    </div>
                </div>
            </div>
            
            <div style="margin-top: 32px; display: flex; gap: 12px; border-top: 1px solid var(--border); padding-top: 24px;">
                <button class="btn btn-primary" onclick="refreshToken(${id}); elements.detailModal.classList.remove('active');" style="flex: 1;">
                    刷新 Token
                </button>
                <button class="btn btn-secondary" onclick="elements.detailModal.classList.remove('active');" style="flex: 1;">
                    关闭
                </button>
            </div>
        `;

        elements.detailModal.classList.add('active');
    } catch (error) {
        toast.error('加载账号详情失败: ' + error.message);
    }
}

// 复制邮箱
function copyEmail(email) {
    copyToClipboard(email);
}

// 删除账号
async function deleteAccount(id, email) {
    const confirmed = await confirm(`确定要删除账号 ${email} 吗？此操作不可恢复。`);
    if (!confirmed) return;

    try {
        await api.delete(`/accounts/${id}`);
        toast.success('账号已删除');
        selectedAccounts.delete(id);
        loadStats();
        loadAccounts();
    } catch (error) {
        toast.error('删除失败: ' + error.message);
    }
}

// 批量删除
async function handleBatchDelete() {
    const count = getEffectiveCount();
    if (count === 0) return;

    const confirmed = await confirm(`确定要删除选中的 ${count} 个账号吗？此操作不可恢复。`);
    if (!confirmed) return;

    try {
        const result = await api.post('/accounts/batch-delete', buildBatchPayload());
        toast.success(`成功删除 ${result.deleted_count} 个账号`);
        selectedAccounts.clear();
        selectAllPages = false;
        loadStats();
        loadAccounts();
    } catch (error) {
        toast.error('删除失败: ' + error.message);
    }
}

// HTML 转义
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============== CPA 服务选择 ==============

// 弹出 CPA 服务选择框，返回 Promise<{cpa_service_id: number|null}|null>
// null 表示用户取消，{cpa_service_id: null} 表示使用全局配置
function selectCpaService() {
    return new Promise(async (resolve) => {
        const modal = document.getElementById('cpa-service-modal');
        const listEl = document.getElementById('cpa-service-list');
        const closeBtn = document.getElementById('close-cpa-modal');
        const cancelBtn = document.getElementById('cancel-cpa-modal-btn');
        const globalBtn = document.getElementById('cpa-use-global-btn');

        // 加载服务列表
        listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted)">加载中...</div>';
        modal.classList.add('active');

        let services = [];
        try {
            services = await api.get('/cpa-services?enabled=true');
        } catch (e) {
            services = [];
        }

        if (services.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;">暂无已启用的 CPA 服务，将使用全局配置</div>';
        } else {
            listEl.innerHTML = services.map(s => `
                <div class="service-card" data-id="${s.id}">
                    <div class="service-card-badge">选择</div>
                    <div style="font-size: 24px; color: var(--primary-color);">[CPA]</div>
                    <div class="service-card-title">${escapeHtml(s.name)}</div>
                    <div class="service-card-desc">${escapeHtml(s.api_url)}</div>
                </div>
            `).join('');

            listEl.querySelectorAll('.service-card').forEach(item => {
                item.addEventListener('click', () => {
                    cleanup();
                    resolve({ cpa_service_id: parseInt(item.dataset.id) });
                });
            });
        }

        function cleanup() {
            modal.classList.remove('active');
            closeBtn.removeEventListener('click', onCancel);
            cancelBtn.removeEventListener('click', onCancel);
            globalBtn.removeEventListener('click', onGlobal);
        }
        function onCancel() { cleanup(); resolve(null); }
        function onGlobal() { cleanup(); resolve({ cpa_service_id: null }); }

        closeBtn.addEventListener('click', onCancel);
        cancelBtn.addEventListener('click', onCancel);
        globalBtn.addEventListener('click', onGlobal);
    });
}

// 单账号上传入口：直接上传到 CPA
async function uploadAccount(id) {
    return uploadToCpa(id);
}

// 上传单个账号到CPA
async function uploadToCpa(id) {
    const choice = await selectCpaService();
    if (choice === null) return;  // 用户取消

    try {
        toast.info('正在上传到CPA...');
        const payload = {};
        if (choice.cpa_service_id != null) payload.cpa_service_id = choice.cpa_service_id;
        const result = await api.post(`/accounts/${id}/upload-cpa`, payload);

        if (result.success) {
            toast.success('上传成功');
            loadAccounts();
        } else {
            toast.error('上传失败: ' + (result.error || '未知错误'));
        }
    } catch (error) {
        toast.error('上传失败: ' + error.message);
    }
}

// 批量上传到CPA
async function handleBatchUploadCpa() {
    const count = getEffectiveCount();
    if (count === 0) return;

    const choice = await selectCpaService();
    if (choice === null) return;  // 用户取消

    const confirmed = await confirm(`确定要将选中的 ${count} 个账号上传到CPA吗？`);
    if (!confirmed) return;

    elements.batchUploadBtn.disabled = true;
    elements.batchUploadBtn.textContent = '上传中...';

    try {
        const payload = buildBatchPayload();
        if (choice.cpa_service_id != null) payload.cpa_service_id = choice.cpa_service_id;
        const result = await api.post('/accounts/batch-upload-cpa', payload);

        let message = `成功: ${result.success_count}`;
        if (result.failed_count > 0) message += `, 失败: ${result.failed_count}`;
        if (result.skipped_count > 0) message += `, 跳过: ${result.skipped_count}`;

        toast.success(message);
        loadAccounts();
    } catch (error) {
        toast.error('批量上传失败: ' + error.message);
    } finally {
        updateBatchButtons();
    }
}

// ============== 订阅状态 ==============

// 手动标记订阅类型
async function markSubscription(id) {
    const type = prompt('请输入订阅类型 (plus / team / free):', 'plus');
    if (!type) return;
    if (!['plus', 'team', 'free'].includes(type.trim().toLowerCase())) {
        toast.error('无效的订阅类型，请输入 plus、team 或 free');
        return;
    }
    try {
        await api.post(`/payment/accounts/${id}/mark-subscription`, {
            subscription_type: type.trim().toLowerCase()
        });
        toast.success('订阅状态已更新');
        loadAccounts();
    } catch (e) {
        toast.error('标记失败: ' + e.message);
    }
}

// ============== Sub2API 上传 ==============

// 弹出 Sub2API 服务选择框，返回 Promise<{service_id: number|null}|null>
// null 表示用户取消，{service_id: null} 表示自动选择
function selectSub2ApiService() {
    return new Promise(async (resolve) => {
        const modal = document.getElementById('sub2api-service-modal');
        const listEl = document.getElementById('sub2api-service-list');
        const closeBtn = document.getElementById('close-sub2api-modal');
        const cancelBtn = document.getElementById('cancel-sub2api-modal-btn');
        const autoBtn = document.getElementById('sub2api-use-auto-btn');

        listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted)">加载中...</div>';
        modal.classList.add('active');

        let services = [];
        try {
            services = await api.get('/sub2api-services?enabled=true');
        } catch (e) {
            services = [];
        }

        if (services.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;">暂无已启用的 Sub2API 服务，将自动选择第一个</div>';
        } else {
            listEl.innerHTML = services.map(s => `
                <div class="sub2api-service-item" data-id="${s.id}" style="
                    padding: 10px 14px;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.15s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div>
                        <div style="font-weight:500;">${escapeHtml(s.name)}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(s.api_url)}</div>
                    </div>
                    <span class="badge" style="background:var(--primary);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:10px;">选择</span>
                </div>
            `).join('');

            listEl.querySelectorAll('.sub2api-service-item').forEach(item => {
                item.addEventListener('mouseenter', () => item.style.background = 'var(--surface-hover)');
                item.addEventListener('mouseleave', () => item.style.background = '');
                item.addEventListener('click', () => {
                    cleanup();
                    resolve({ service_id: parseInt(item.dataset.id) });
                });
            });
        }

        function cleanup() {
            modal.classList.remove('active');
            closeBtn.removeEventListener('click', onCancel);
            cancelBtn.removeEventListener('click', onCancel);
            autoBtn.removeEventListener('click', onAuto);
        }
        function onCancel() { cleanup(); resolve(null); }
        function onAuto() { cleanup(); resolve({ service_id: null }); }

        closeBtn.addEventListener('click', onCancel);
        cancelBtn.addEventListener('click', onCancel);
        autoBtn.addEventListener('click', onAuto);
    });
}

// 批量上传到 Sub2API
async function handleBatchUploadSub2Api() {
    const count = getEffectiveCount();
    if (count === 0) return;

    const choice = await selectSub2ApiService();
    if (choice === null) return;  // 用户取消

    const confirmed = await confirm(`确定要将选中的 ${count} 个账号上传到 Sub2API 吗？`);
    if (!confirmed) return;

    elements.batchUploadBtn.disabled = true;
    elements.batchUploadBtn.textContent = '上传中...';

    try {
        const payload = buildBatchPayload();
        if (choice.service_id != null) payload.service_id = choice.service_id;
        const result = await api.post('/accounts/batch-upload-sub2api', payload);

        let message = `成功: ${result.success_count}`;
        if (result.failed_count > 0) message += `, 失败: ${result.failed_count}`;
        if (result.skipped_count > 0) message += `, 跳过: ${result.skipped_count}`;

        toast.success(message);
        loadAccounts();
    } catch (error) {
        toast.error('批量上传失败: ' + error.message);
    } finally {
        updateBatchButtons();
    }
}

// ============== Team Manager 上传 ==============

// 上传单账号到 Sub2API
async function uploadToSub2Api(id) {
    const choice = await selectSub2ApiService();
    if (choice === null) return;
    try {
        toast.info('正在上传到 Sub2API...');
        const payload = {};
        if (choice.service_id != null) payload.service_id = choice.service_id;
        const result = await api.post(`/accounts/${id}/upload-sub2api`, payload);
        if (result.success) {
            toast.success('上传成功');
            loadAccounts();
        } else {
            toast.error('上传失败: ' + (result.error || result.message || '未知错误'));
        }
    } catch (e) {
        toast.error('上传失败: ' + e.message);
    }
}

// 弹出 Team Manager 服务选择框，返回 Promise<{service_id: number|null}|null>
// null 表示用户取消，{service_id: null} 表示自动选择
function selectTmService() {
    return new Promise(async (resolve) => {
        const modal = document.getElementById('tm-service-modal');
        const listEl = document.getElementById('tm-service-list');
        const closeBtn = document.getElementById('close-tm-modal');
        const cancelBtn = document.getElementById('cancel-tm-modal-btn');
        const autoBtn = document.getElementById('tm-use-auto-btn');

        listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted)">加载中...</div>';
        modal.classList.add('active');

        let services = [];
        try {
            services = await api.get('/tm-services?enabled=true');
        } catch (e) {
            services = [];
        }

        if (services.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:12px;">暂无已启用的 Team Manager 服务，将自动选择第一个</div>';
        } else {
            listEl.innerHTML = services.map(s => `
                <div class="tm-service-item" data-id="${s.id}" style="
                    padding: 10px 14px;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: background 0.15s;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div>
                        <div style="font-weight:500;">${escapeHtml(s.name)}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(s.api_url)}</div>
                    </div>
                    <span class="badge" style="background:var(--primary);color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:10px;">选择</span>
                </div>
            `).join('');

            listEl.querySelectorAll('.tm-service-item').forEach(item => {
                item.addEventListener('mouseenter', () => item.style.background = 'var(--surface-hover)');
                item.addEventListener('mouseleave', () => item.style.background = '');
                item.addEventListener('click', () => {
                    cleanup();
                    resolve({ service_id: parseInt(item.dataset.id) });
                });
            });
        }

        function cleanup() {
            modal.classList.remove('active');
            closeBtn.removeEventListener('click', onCancel);
            cancelBtn.removeEventListener('click', onCancel);
            autoBtn.removeEventListener('click', onAuto);
        }
        function onCancel() { cleanup(); resolve(null); }
        function onAuto() { cleanup(); resolve({ service_id: null }); }

        closeBtn.addEventListener('click', onCancel);
        cancelBtn.addEventListener('click', onCancel);
        autoBtn.addEventListener('click', onAuto);
    });
}

// 上传单账号到 Team Manager
async function uploadToTm(id) {
    const choice = await selectTmService();
    if (choice === null) return;
    try {
        toast.info('正在上传到 Team Manager...');
        const payload = {};
        if (choice.service_id != null) payload.service_id = choice.service_id;
        const result = await api.post(`/accounts/${id}/upload-tm`, payload);
        if (result.success) {
            toast.success('上传成功');
        } else {
            toast.error('上传失败: ' + (result.message || '未知错误'));
        }
    } catch (e) {
        toast.error('上传失败: ' + e.message);
    }
}

// 批量上传到 Team Manager
async function handleBatchUploadTm() {
    const count = getEffectiveCount();
    if (count === 0) return;

    const choice = await selectTmService();
    if (choice === null) return;  // 用户取消

    const confirmed = await confirm(`确定要将选中的 ${count} 个账号上传到 Team Manager 吗？`);
    if (!confirmed) return;

    elements.batchUploadBtn.disabled = true;
    elements.batchUploadBtn.textContent = '上传中...';

    try {
        const payload = buildBatchPayload();
        if (choice.service_id != null) payload.service_id = choice.service_id;
        const result = await api.post('/accounts/batch-upload-tm', payload);
        let message = `成功: ${result.success_count}`;
        if (result.failed_count > 0) message += `, 失败: ${result.failed_count}`;
        if (result.skipped_count > 0) message += `, 跳过: ${result.skipped_count}`;
        toast.success(message);
        loadAccounts();
    } catch (e) {
        toast.error('批量上传失败: ' + e.message);
    } finally {
        updateBatchButtons();
    }
}

// 更多菜单切换
function toggleMoreMenu(btn) {
    const menu = btn.nextElementSibling;
    const isActive = menu.classList.contains('active');
    // 关闭所有其他更多菜单
    document.querySelectorAll('.dropdown-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
}

function closeMoreMenu(el) {
    const menu = el.closest('.dropdown-menu');
    if (menu) menu.classList.remove('active');
}

// 查询收件箱验证码
async function checkInboxCode(id) {
    toast.info('正在查询收件箱...');
    try {
        const result = await api.post(`/accounts/${id}/inbox-code`);
        if (result.success) {
            showInboxCodeResult(result.code, result.email);
        } else {
            toast.error('查询失败: ' + (result.error || '未收到验证码'));
        }
    } catch (error) {
        toast.error('查询失败: ' + error.message);
    }
}

function showInboxCodeResult(code, email) {
    elements.modalBody.innerHTML = `
        <div style="text-align:center; padding:24px 16px;">
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">
                ${escapeHtml(email)} 最新验证码
            </div>
            <div style="font-size:36px;font-weight:700;letter-spacing:8px;
                        color:var(--primary);font-family:monospace;margin-bottom:20px;">
                ${escapeHtml(code)}
            </div>
            <button class="btn btn-primary" onclick="copyToClipboard('${escapeHtml(code)}')">复制验证码</button>
        </div>
    `;
    elements.detailModal.classList.add('active');
}
