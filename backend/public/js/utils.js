// frontend/static/js/utils.js

/**
 * Exibe uma mensagem modal centrada que desaparece automaticamente.
 * @param {string} text O texto da mensagem a ser exibida.
 * @param {boolean} isError Se true, exibe a mensagem como erro.
 * @param {number} duration A duração em milissegundos para a mensagem permanecer visível (padrão: 3000ms).
 */
export function showMessage(text, isError = false, duration = 3000) {
    const messageBox = document.getElementById('message-box');
    const messageText = document.getElementById('message-text');
    const modalBackdrop = document.getElementById('modal-backdrop');

    if (messageBox && messageText && modalBackdrop) {
        messageText.innerText = text;
        messageBox.style.display = 'flex'; // Usar flex para centralizar conteúdo
        modalBackdrop.style.display = 'block'; // Exibir o backdrop

        // Adiciona classe para estilo de erro/sucesso
        if (isError) {
            messageBox.classList.add('error');
            messageBox.classList.remove('success');
        } else {
            messageBox.classList.add('success');
            messageBox.classList.remove('error');
        }

        // Define um temporizador para esconder a mensagem e o backdrop
        setTimeout(() => {
            messageBox.style.display = 'none';
            modalBackdrop.style.display = 'none'; // Esconder o backdrop também
            messageBox.classList.remove('error', 'success'); // Limpa classes
        }, duration);
    } else {
        console.warn("Erro: Elementos de mensagem (message-box, message-text, modal-backdrop) não encontrados no HTML. A mensagem não será exibida corretamente.");
    }
}

/**
 * Exibe ou oculta um indicador de carregamento de ecrã inteiro.
 * @param {boolean} show Se true, exibe o indicador; se false, oculta.
 */
export function showLoading(show) {
    const loadingIndicator = document.getElementById('loading-indicator');
    const modalBackdrop = document.getElementById('modal-backdrop'); // DECLARADO AQUI

    if (loadingIndicator && modalBackdrop) { // VERIFICA AQUI AMBOS OS ELEMENTOS
        loadingIndicator.style.display = show ? 'flex' : 'none'; // Usar flex
        modalBackdrop.style.display = show ? 'block' : 'none'; // AGORA CONTROLA O BACKDROP TAMBÉM
    } else {
        console.warn("Erro: Elementos de carregamento (loading-indicator, modal-backdrop) não encontrados no HTML. O indicador não será exibido.");
    }
}
