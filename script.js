const form = document.getElementById('jobForm');
const table = document.getElementById('jobTable');
const filterStatus = document.getElementById('filterStatus');
const statusChart = document.getElementById('statusChart');
const report = document.getElementById('report');
const refreshButton = document.getElementById('refreshButton');

let jobs = [];
let statusChartInstance = null;

setInterval(saveJobsToStorage, 60000); // 每分钟自动保存一次

// 添加加密密钥生成
const key = crypto.subtle.generateKey(
    {
        name: "AES-GCM",
        length: 256,
    },
    true,
    ["encrypt", "decrypt"]
);

// 添加加密函数
async function encryptData(data) {
    const encoded = new TextEncoder().encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await key;

    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        keyMaterial,
        encoded
    );

    return { iv, encrypted };
}

// 添加解密函数
async function decryptData(iv, encrypted) {
    const keyMaterial = await key;

    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        keyMaterial,
        encrypted
    );

    return new TextDecoder().decode(decrypted);
}

let db;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('JobApplications', 1);
        request.onerror = (event) => reject('数据库打开失败');
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            db.createObjectStore('jobs', { keyPath: 'id', autoIncrement: true });
        };
    });
}

async function saveJobsToStorage() {
    try {
        await openDB();
        const transaction = db.transaction(['jobs'], 'readwrite');
        const store = transaction.objectStore('jobs');
        await store.clear();
        for (const job of jobs) {
            await store.add(job);
        }
        console.log('数据保存成功');
    } catch (error) {
        console.error('保存数据时出错:', error);
        alert('保存数据失败，请尝试备份您的数据');
    }
}

async function loadJobsFromStorage() {
    try {
        await openDB();
        const transaction = db.transaction(['jobs'], 'readonly');
        const store = transaction.objectStore('jobs');
        const request = store.getAll();
        return new Promise((resolve, reject) => {
            request.onerror = (event) => reject('获取数据失败');
            request.onsuccess = (event) => {
                jobs = event.target.result;
                refreshJobTable();
                updateChart();
                generateReport();
                checkRecordCount(); // 添加这行
                resolve(jobs);
            };
        });
    } catch (error) {
        console.error('加载数据时出错:', error);
        jobs = [];
    }
}

form.addEventListener('submit', function (e) {
    e.preventDefault();
    const company = document.getElementById('company').value;
    const position = document.getElementById('position').value;
    const date = document.getElementById('date').value;
    const status = document.getElementById('status').value;

    addJob(company, position, date, status);
    form.reset();
});

refreshButton.addEventListener('click', function () {
    updateChart();
    generateReport();
});

function addJob(company, position, date, status, interviewNotes = '', interviewDate = '') {
    const job = { company, position, date, status, interviewNotes, interviewDate };
    jobs.push(job);
    jobs.sort((a, b) => new Date(b.date) - new Date(a.date));
    refreshJobTable();
    updateChart();
    generateReport();
    saveJobsToStorage();
    checkRecordCount(); // 添加这行
}

function refreshJobTable() {
    while (table.rows.length > 1) {
        table.deleteRow(1);
    }
    jobs.forEach((job, index) => addRow(job, index));
}

function addRow(job, index) {
    const row = table.insertRow(-1);
    row.innerHTML = `
        <td>${job.company}</td>
        <td>${job.position}</td>
        <td>${job.date}</td>
        <td><input type="date" value="${job.interviewDate}" onchange="updateInterviewDate(this, ${index})"></td>
        <td>
            <select onchange="updateStatus(this, ${index})">
                <option value="待回复" ${job.status === '待回复' ? 'selected' : ''}>待回复</option>
                <option value="待面试" ${job.status === '待面试' ? 'selected' : ''}>待面试</option>
                <option value="已面试" ${job.status === '已面试' ? 'selected' : ''}>已面试</option>
                <option value="已拒绝" ${job.status === '已拒绝' ? 'selected' : ''}>已拒绝</option>
                <option value="已录用" ${job.status === '已录用' ? 'selected' : ''}>已录用</option>
            </select>
        </td>
        <td><button class="interview-notes-btn" onclick="openInterviewNotes(${index})">📝</button></td>
        <td><button onclick="deleteJob(${index})">删除</button></td>
    `;
}

function openInterviewNotes(index) {
    const modal = document.getElementById('interviewNotesModal');
    const textarea = document.getElementById('interviewNotesText');
    const saveButton = document.getElementById('saveInterviewNotes');

    textarea.value = jobs[index].interviewNotes || '';
    modal.style.display = 'block';

    saveButton.onclick = function () {
        jobs[index].interviewNotes = textarea.value;
        saveJobsToStorage();
        modal.style.display = 'none';
    };

    const span = document.getElementsByClassName('close')[0];
    span.onclick = function () {
        modal.style.display = 'none';
    };

    window.onclick = function (event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
}

function updateStatus(select, index) {
    jobs[index].status = select.value;
    updateChart();
    generateReport();
    saveJobsToStorage();
}

function updateInterviewDate(input, index) {
    jobs[index].interviewDate = input.value;
    saveJobsToStorage();
}

function deleteJob(index) {
    jobs.splice(index, 1);
    refreshJobTable();
    updateChart();
    generateReport();
    saveJobsToStorage();
}

filterStatus.addEventListener('change', function () {
    const selectedStatus = this.value;
    const rows = table.getElementsByTagName('tr');
    for (let i = 1; i < rows.length; i++) {
        const statusCell = rows[i].getElementsByTagName('td')[4];
        const statusSelect = statusCell.getElementsByTagName('select')[0];
        if (selectedStatus === 'all' || statusSelect.value === selectedStatus) {
            rows[i].style.display = '';
        } else {
            rows[i].style.display = 'none';
        }
    }
});

function updateChart() {
    const statusCounts = {
        '待回复': 0, '待面试': 0, '已面试': 0, '已拒绝': 0, '已录用': 0
    };

    jobs.forEach(job => {
        statusCounts[job.status]++;
    });

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    statusChartInstance = new Chart(statusChart, {
        type: 'pie',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
            }]
        },
        options: {
            responsive: true,
            title: {
                display: true,
                text: '投递状态分布'
            }
        }
    });
}

function generateReport() {
    const totalJobs = jobs.length;
    const pendingJobs = jobs.filter(job => job.status === '待回复').length;
    const interviewedJobs = jobs.filter(job => job.status === '已面试' || job.status === '已录用').length;
    const offeredJobs = jobs.filter(job => job.status === '已录用').length;

    report.innerHTML = `
        <h2>数据报告</h2>
        <p>总投递数量：${totalJobs}</p>
        <p>待回复数量：${pendingJobs}</p>
        <p>已面试数量：${interviewedJobs}</p>
        <p>已录用数量：${offeredJobs}</p>
        <p>面试率：${totalJobs > 0 ? (interviewedJobs / totalJobs * 100).toFixed(2) : 0}%</p>
        <p>录用率：${totalJobs > 0 ? (offeredJobs / totalJobs * 100).toFixed(2) : 0}%</p>
    `;
}

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const isDarkTheme = document.body.classList.contains('dark-theme');
    localStorage.setItem('darkTheme', isDarkTheme);
    document.getElementById('themeToggle').textContent = isDarkTheme ? '切换到浅色主题' : '切换到深色主题';
}

function loadThemePreference() {
    const isDarkTheme = localStorage.getItem('darkTheme') === 'true';
    if (isDarkTheme) {
        document.body.classList.add('dark-theme');
        document.getElementById('themeToggle').textContent = '切换到浅色主题';
    }
}

document.addEventListener('DOMContentLoaded', async function () {
    try {
        await loadJobsFromStorage();
        loadThemePreference();

        const themeToggle = document.getElementById('themeToggle');
        themeToggle.addEventListener('click', toggleTheme);

        document.getElementById('exportExcel').addEventListener('click', function () {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(jobs);
            XLSX.utils.book_append_sheet(wb, ws, "简历投递记录");
            XLSX.writeFile(wb, "简历投递记录.xlsx");
        });

        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', filterJobs);

        function filterJobs() {
            const searchTerm = searchInput.value.toLowerCase();
            const statusFilter = document.getElementById('filterStatus').value;
            const rows = document.querySelectorAll('#jobTable tr:not(:first-child)');

            rows.forEach(row => {
                const company = row.cells[0].textContent.toLowerCase();
                const position = row.cells[1].textContent.toLowerCase();
                const status = row.cells[4].textContent;
                const matchesSearch = company.includes(searchTerm) || position.includes(searchTerm);
                const matchesStatus = statusFilter === 'all' || status === statusFilter;

                if (matchesSearch && matchesStatus) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        }

        function filterTable() {
            filterJobs();
        }

        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        const jobTable = document.getElementById('jobTable');
        jobTable.parentNode.insertBefore(tableContainer, jobTable);
        tableContainer.appendChild(jobTable);

        // 添加备份和恢复按钮的事件监听器
        document.getElementById('backupData').addEventListener('click', backupData);

        const restoreButton = document.getElementById('restoreData');
        const fileInput = document.getElementById('restoreFile');

        restoreButton.addEventListener('click', function () {
            fileInput.click();
        });

        fileInput.addEventListener('change', restoreData);
    } catch (error) {
        console.error('初始化时出错:', error);
        // 可以在这里添加用户提示
    }
});

// 修改 backupData 函数
async function backupData() {
    const data = JSON.stringify(jobs);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '简历投递记录备份.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 修改 restoreData 函数
async function restoreData(event) {
    const fileInput = event.target;
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                jobs = JSON.parse(e.target.result);
                refreshJobTable();
                updateChart();
                generateReport();
                await saveJobsToStorage();
                alert('数据恢复成功！');
            } catch (error) {
                console.error('恢复数据时出错:', error);
                alert('恢复数据失败，请确保选择了正确的备份文件。');
            } finally {
                fileInput.value = '';
            }
        };
        reader.readAsText(file);
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').then(function (registration) {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, function (err) {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// 修改 checkRecordCount 函数
function checkRecordCount() {
    const thresholds = [10, 20, 30, 40, 50];
    const recordCount = jobs.length;
    
    if (thresholds.includes(recordCount)) {
        const message = `您现在有${recordCount}条记录。建议您导出数据或备份数据，以防数据丢失。请选择操作：`;
        const result = confirm(message);
        if (result) {
            showExportOptions();
        }
    }
}

// 添加新函数来显示导出选项
function showExportOptions() {
    const exportOptions = document.createElement('div');
    exportOptions.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center;">
            <div style="background: white; padding: 20px; border-radius: 5px; text-align: center;">
                <h3>请选择导出方式</h3>
                <button id="exportExcelBtn" style="margin: 10px;">导出为Excel</button>
                <button id="backupJsonBtn" style="margin: 10px;">备份数据(JSON)</button>
                <button id="cancelExportBtn" style="margin: 10px;">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(exportOptions);

    document.getElementById('exportExcelBtn').addEventListener('click', () => {
        exportToExcel();
        document.body.removeChild(exportOptions);
    });

    document.getElementById('backupJsonBtn').addEventListener('click', () => {
        backupData();
        document.body.removeChild(exportOptions);
    });

    document.getElementById('cancelExportBtn').addEventListener('click', () => {
        document.body.removeChild(exportOptions);
    });
}

// 修改 exportToExcel 函数
function exportToExcel() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(jobs);
    XLSX.utils.book_append_sheet(wb, ws, "简历投递记录");
    XLSX.writeFile(wb, "简历投递记录.xlsx");
}

// 添加 backupData 函数
function backupData() {
    const data = JSON.stringify(jobs);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '简历投递记录备份.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}