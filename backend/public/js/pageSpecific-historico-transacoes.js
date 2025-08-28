// frontend/static/js/pageSpecific-historico-transacoes.js
// Lógica específica para a página de histórico de transações.

import { showMessage, showLoading } from './utils.js';
import { protectPage } from './session.js';

// Protege a página, redirecionando se o utilizador não estiver autenticado
protectPage();

document.addEventListener('DOMContentLoaded', async () => {
    const transactionsList = document.getElementById('transactionsList');
    const noTransactionsMessage = document.getElementById('noTransactionsMessage');
    const tabButtons = document.querySelectorAll('.transaction-tab-button');
    let currentFilter = 'all'; // Filtro inicial

    // Função para formatar a data
    const formatDateTime = (isoString) => {
        const date = new Date(isoString);
        // Formato DD/MM/AAAA HH:MM
        return date.toLocaleDateString('pt-PT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // Função para carregar e exibir as transações
    async function loadTransactions(filter = 'all') {
        showLoading(true); // Mostra o indicador de carregamento
        transactionsList.innerHTML = ''; // Limpa a lista existente
        noTransactionsMessage.style.display = 'none'; // Esconde a mensagem de "nenhuma transação"

        const userToken = localStorage.getItem('userToken');
        if (!userToken) {
            showMessage('Não autenticado. Por favor, faça login novamente.', true);
            showLoading(false);
            setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
            return;
        }

        let allTransactions = [];

        try {
            // #region Fetch Withdrawals
            const withdrawalsResponse = await fetch('http://localhost:5000/api/withdrawals/history', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                }
            });
            if (withdrawalsResponse.ok) {
                const withdrawalsData = await withdrawalsResponse.json();
                allTransactions.push(...withdrawalsData.history.map(tx => ({ ...tx, type: 'withdrawal' })));
            } else {
                console.error('Erro ao buscar histórico de levantamentos:', await withdrawalsResponse.text());
                showMessage('Erro ao carregar levantamentos.', true);
            }
            // #endregion

            // #region Fetch Deposits
            // TODO: Quando o endpoint /api/deposits/history estiver pronto no backend, descomente este bloco.
            const depositsResponse = await fetch('http://localhost:5000/api/deposits/history', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                }
            });
            if (depositsResponse.ok) {
                const depositsData = await depositsResponse.json();
                allTransactions.push(...depositsData.history.map(tx => ({ ...tx, type: 'deposit' })));
            } else {
                 console.warn('Endpoint /api/deposits/history ainda não implementado ou erro:', await depositsResponse.text());
                // Dados fictícios para demonstração enquanto o endpoint não está pronto
                // allTransactions.push(
                //     { id: 'dep1', amount: 100, status: 'Aprovado', timestamp: new Date(Date.now() - 86400000).toISOString(), type: 'deposit' },
                //     { id: 'dep2', amount: 250, status: 'Aprovado', timestamp: new Date(Date.now() - 172800000).toISOString(), type: 'deposit' }
                // );
            }
            // #endregion

            // #region Fetch Investments
            // TODO: Quando o endpoint /api/investments/history estiver pronto no backend, descomente este bloco.
            const investmentsResponse = await fetch('http://localhost:5000/api/investments/history', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${userToken}`
                }
            });
            if (investmentsResponse.ok) {
                const investmentsData = await investmentsResponse.json();
                allTransactions.push(...investmentsData.history.map(tx => ({ ...tx, type: 'investment' })));
            } else {
                console.warn('Endpoint /api/investments/history ainda não implementado ou erro:', await investmentsResponse.text());
                // Dados fictícios para demonstração enquanto o endpoint não está pronto
                // allTransactions.push(
                //     { id: 'inv1', packageName: 'Pacote Bronze', amount: 500, roi: '10%', status: 'Ativo', timestamp: new Date(Date.now() - 259200000).toISOString(), type: 'investment' },
                //     { id: 'inv2', packageName: 'Pacote Prata', amount: 1000, roi: '15%', status: 'Concluído', timestamp: new Date(Date.now() - 518400000).toISOString(), type: 'investment' }
                // );
            }
            // #endregion


            // Ordena as transações pela data mais recente primeiro
            allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            let filteredTransactions = [];
            if (filter === 'all') {
                filteredTransactions = allTransactions;
            } else {
                filteredTransactions = allTransactions.filter(tx => tx.type === filter);
            }

            if (filteredTransactions.length === 0) {
                noTransactionsMessage.style.display = 'block';
                const placeholderItem = document.createElement('li');
                placeholderItem.className = 'transaction-item placeholder-item';
                placeholderItem.innerHTML = `<p>Não há transações de ${getPortugueseTransactionType(filter)} para exibir.</p>`;
                transactionsList.appendChild(placeholderItem);
            } else {
                filteredTransactions.forEach(tx => {
                    const listItem = document.createElement('li');
                    listItem.className = 'transaction-item';

                    let details = '';
                    let mainAmount = '';
                    switch (tx.type) {
                        case 'withdrawal':
                            mainAmount = `Kz ${tx.requested_amount.toFixed(2).replace('.', ',')}`;
                            details = `
                                <span><strong>Taxa:</strong> Kz ${tx.fee.toFixed(2).replace('.', ',')}</span>
                                <span><strong>Valor Recebido:</strong> Kz ${tx.actual_amount.toFixed(2).replace('.', ',')}</span>
                                <span><strong>Conta Usada:</strong> ${tx.account_number_used}</span>
                            `;
                            break;
                        case 'deposit':
                            mainAmount = `Kz ${tx.amount.toFixed(2).replace('.', ',')}`;
                            // Assume que `tx.amount` é o valor depositado
                            // Se tiver mais detalhes para o depósito (e.g., comprovativo, banco), adicione aqui
                            details = ``; 
                            break;
                        case 'investment':
                            mainAmount = `Kz ${tx.amount.toFixed(2).replace('.', ',')}`;
                            details = `
                                <span><strong>Pacote:</strong> ${tx.packageName}</span>
                                <span><strong>ROI Esperado:</strong> ${tx.roi}</span>
                            `;
                            break;
                    }

                    listItem.innerHTML = `
                        <div>
                            <strong>Tipo:</strong> ${getPortugueseTransactionType(tx.type)}
                            <span class="transaction-status status-${tx.status.toLowerCase()}">${tx.status}</span>
                            <strong style="float: right;">${mainAmount}</strong>
                        </div>
                        ${details}
                        <span class="transaction-date"><strong>Data:</strong> ${formatDateTime(tx.timestamp)}</span>
                    `;
                    transactionsList.appendChild(listItem);
                });
            }

        } catch (error) {
            console.error('Erro ao carregar transações:', error);
            showMessage('Erro ao carregar histórico de transações. Tente novamente mais tarde.', true);
        } finally {
            showLoading(false); // Esconde o indicador de carregamento
        }
    }

    // Função auxiliar para obter o nome do tipo de transação em português
    function getPortugueseTransactionType(type) {
        switch (type) {
            case 'all': return 'Todas';
            case 'deposit': return 'Depósito';
            case 'withdrawal': return 'Levantamento';
            case 'investment': return 'Investimento';
            default: return type;
        }
    }

    // Adiciona event listeners para os botões de filtro
    tabButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            tabButtons.forEach(btn => btn.classList.remove('active')); // Remove 'active' de todos
            event.currentTarget.classList.add('active'); // Adiciona 'active' ao botão clicado
            currentFilter = event.currentTarget.dataset.type; // Atualiza o filtro
            loadTransactions(currentFilter); // Recarrega as transações com o novo filtro
        });
    });

    // Carrega as transações iniciais ao carregar a página
    loadTransactions(currentFilter);
});
