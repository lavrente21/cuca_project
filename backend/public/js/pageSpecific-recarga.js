// frontend/static/js/pageSpecific-recarga.js
// Lógica específica para a página de recarga.

import { showMessage, showLoading } from './utils.js';
import { protectPage } from './session.js';

protectPage();

document.addEventListener('DOMContentLoaded', () => {
    const depositAmountInput = document.getElementById('depositAmount');
    const valueOptionButtons = document.querySelectorAll('.value-option-button');
    const confirmDepositButton = document.querySelector('.action-main-button');
    const fileInput = document.getElementById('arquivo'); // O input de arquivo para o comprovativo

    // Adiciona event listeners aos botões de opção de valor
    valueOptionButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove 'Kz ' e substitui vírgula por ponto para garantir que seja um número flutuante válido
            const amount = button.textContent.replace('Kz ', '').replace(',', '.');
            if (depositAmountInput) {
                depositAmountInput.value = amount;
            }
        });
    });

    // Lógica para o botão "Confirmar Deposito"
    if (confirmDepositButton) {
        confirmDepositButton.addEventListener('click', async (event) => {
            event.preventDefault();

            const amount = depositAmountInput ? depositAmountInput.value : '';
            const selectedFile = fileInput ? fileInput.files[0] : null;
            const userToken = localStorage.getItem('userToken'); // Obtém o JWT

            if (!userToken) {
                showMessage('Sessão expirada. Por favor, faça login novamente.', true);
                setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
                return;
            }

            if (!amount || parseFloat(amount) <= 0) {
                showMessage('Por favor, insira um valor de depósito válido e positivo.');
                return;
            }

            if (!selectedFile) {
                showMessage('Por favor, selecione um comprovativo de pagamento.');
                return;
            }

            showLoading(true);

            // Usa FormData para enviar o ficheiro e os dados juntos
            const formData = new FormData();
            formData.append('amount', amount);
            formData.append('file', selectedFile);

            try {
                // *** O URL DO BACKEND AGORA É O NODE.JS ***
                const response = await fetch('http://localhost:5000/api/deposit', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${userToken}` // Envia o JWT
                        // 'Content-Type' não é definido para FormData, o navegador faz isso automaticamente
                    },
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage('Depósito de Kz' + parseFloat(amount).toFixed(2).replace('.', ',') + ' confirmado com sucesso! ' + data.message);
                    if (depositAmountInput) depositAmountInput.value = '';
                    if (fileInput) fileInput.value = '';

                    // Atualiza o saldo de recarga no localStorage, se a resposta contiver
                    if (data.new_balance_recharge !== undefined) {
                        localStorage.setItem('balance_recharge', data.new_balance_recharge);
                    }

                    setTimeout(() => {
                        window.location.href = 'minha conta.html';
                    }, 2000);
                } else {
                    showMessage('Erro ao confirmar depósito: ' + (data.error || data.message || 'Erro desconhecido.'), true);
                    if (response.status === 401 || response.status === 403) {
                        setTimeout(() => { window.location.href = '/Login.html'; }, 2000);
                    }
                }
            } catch (error) {
                console.error('Erro na requisição de depósito:', error);
                showMessage('Não foi possível conectar ao servidor ou houve um erro inesperado.', true);
            } finally {
                showLoading(false);
            }
        });
    }
});
