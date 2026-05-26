const scanBtn = document.getElementById('scan-btn');
const urlInput = document.getElementById('url-input');
const logWindow = document.getElementById('log-window');
const endpointList = document.getElementById('endpoint-list');
const countDisplay = document.getElementById('count-endpoints');
const downloadBtn = document.getElementById('download-btn');

let endpointCount = 0;

function addLog(msg, type = 'info') {
    const div = document.createElement('div');
    const colors = {
        info: 'text-slate-400',
        success: 'text-emerald-400',
        error: 'text-rose-400',
        api: 'text-indigo-400 font-bold'
    };
    div.className = `${colors[type]} py-0.5`;
    div.innerHTML = `<span class="text-slate-600 mr-2">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    logWindow.appendChild(div);
    logWindow.scrollTop = logWindow.scrollHeight;
}

function createEndpointCard(url, method, status) {
    endpointCount++;
    countDisplay.innerText = endpointCount;

    const card = document.createElement('div');
    card.className = "endpoint-card bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex items-center justify-between group";
    
    const statusColor = status >= 400 ? 'text-rose-400' : 'text-emerald-400';
    
    card.innerHTML = `
        <div class="flex items-center gap-4 truncate">
            <span class="bg-slate-800 px-3 py-1 rounded text-xs font-bold text-indigo-400 min-w-[60px] text-center">${method}</span>
            <span class="text-sm font-mono text-slate-300 truncate">${url}</span>
        </div>
        <div class="flex items-center gap-6">
            <span class="text-xs font-mono ${statusColor}">${status}</span>
            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors"></i>
        </div>
    `;
    endpointList.prepend(card); // Newest on top
    lucide.createIcons();
}

scanBtn.addEventListener('click', async () => {
    const target = urlInput.value.trim();
    if (!target) return alert('Please enter a target URL');

    // Reset UI
    endpointList.innerHTML = '';
    logWindow.innerHTML = '';
    endpointCount = 0;
    countDisplay.innerText = '0';
    downloadBtn.classList.add('hidden');
    
    addLog(`Initializing forensic engine for: ${target}`, 'info');
    scanBtn.disabled = true;
    scanBtn.innerHTML = `<span class="animate-pulse">SCANNING...</span>`;

    try {
        const response = await fetch('/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: target })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(Boolean);
            
            lines.forEach(line => {
                const data = JSON.parse(line);
                if (data.type === 'log') {
                    addLog(data.msg, 'api');
                    // Sample data parsing for card display
                    if(data.msg.includes('->')) {
                        const [method, url] = data.msg.replace('🔍 DETECTED: ', '').split(' -> ');
                        createEndpointCard(url, method, 'PENDING');
                    }
                } else if (data.type === 'step') {
                    addLog(data.msg, 'success');
                } else if (data.type === 'done') {
                    addLog('Forensic Scan Complete!', 'success');
                    downloadBtn.classList.remove('hidden');
                    downloadBtn.onclick = () => window.location.href = `/download/${data.requestId}`;
                }
            });
        }
    } catch (err) {
        addLog(`Error: ${err.message}`, 'error');
    } finally {
        scanBtn.disabled = false;
        scanBtn.innerHTML = `<span>SCAN</span><i data-lucide="zap" class="w-4 h-4"></i>`;
        lucide.createIcons();
    }
});