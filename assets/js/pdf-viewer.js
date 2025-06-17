// assets/js/pdf-viewer.js

/**
 * Módulo para gestionar la visualización de PDFs con PDF.js y Bootstrap Modals.
 * Diseñado para ser un script independiente y reutilizable.
 */
const PDFViewerModule = (() => {
    // Referencias a elementos del DOM, se inicializan en `createViewer`
    let _elements = {
        modal: null,
        canvas: null,
        ctx: null,
        prevPageBtn: null,
        nextPageBtn: null,
        zoomInBtn: null,
        zoomOutBtn: null,
        downloadPdfBtn: null,
        currentPageSpan: null,
        totalPagesSpan: null,
    };

    // Variables de estado del PDF
    let _pdfDoc = null;
    let _pageNum = 1;
    let _scale = 1.0;
    let _currentPdfUrl = null; // URL del PDF cargado (Object URL si es un blob)
    let _currentDownloadUrl = null; // URL original para descarga (si es diferente)

    // Variables para el zoom táctil
    let _initialPinchDistance = null;
    let _initialScale = 1.0;

    /**
     * Calcula la distancia entre dos puntos táctiles para el zoom.
     * @param {TouchEvent} e El evento táctil.
     * @returns {number} La distancia entre los dos dedos.
     */
    function _getPinchDistance(e) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        return Math.sqrt(
            Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2)
        );
    }

    /**
     * Renderiza una página específica del PDF en el canvas.
     * @param {number} num El número de página a renderizar.
     */
    async function _renderPage(num) {
        if (!_pdfDoc || !_elements.canvas || !_elements.ctx) return;

        _pageNum = num;
        _elements.currentPageSpan.textContent = _pageNum;

        try {
            const page = await _pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: _scale });

            // Ajusta el tamaño del canvas para adaptarse al viewport y mantener la calidad
            const outputScale = window.devicePixelRatio || 1; // Para pantallas de alta densidad (Retina)
            _elements.canvas.width = Math.floor(viewport.width * outputScale);
            _elements.canvas.height = Math.floor(viewport.height * outputScale);
            _elements.canvas.style.width = Math.floor(viewport.width) + 'px';
            _elements.canvas.style.height = Math.floor(viewport.height) + 'px';

            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;

            const renderContext = {
                canvasContext: _elements.ctx,
                viewport: viewport,
                transform: transform
            };
            await page.render(renderContext).promise;
        } catch (error) {
            console.error('Error al renderizar la página:', error);
            _showMessageBox("Error", "No se pudo renderizar la página del PDF.");
        }
    }

    /** Navega a la página anterior del PDF. */
    function _onPrevPage() {
        if (_pageNum <= 1) {
            return;
        }
        _pageNum--;
        _renderPage(_pageNum);
    }

    /** Navega a la página siguiente del PDF. */
    function _onNextPage() {
        if (_pageNum >= _pdfDoc.numPages) {
            return;
        }
        _pageNum++;
        _renderPage(_pageNum);
    }

    /** Aumenta el nivel de zoom del PDF. */
    function _onZoomIn() {
        _scale = Math.min(_scale + 0.2, 3.0); // Límite máximo de zoom
        _renderPage(_pageNum);
    }

    /** Disminuye el nivel de zoom del PDF. */
    function _onZoomOut() {
        _scale = Math.max(_scale - 0.2, 0.4); // Límite mínimo de zoom
        _renderPage(_pageNum);
    }

    /** Maneja la descarga del PDF. */
    function _onDownloadPdf() {
        if (_currentDownloadUrl) {
            const a = document.createElement('a');
            a.href = _currentDownloadUrl;
            a.download = 'documento.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            _showMessageBox("Información", "No hay un PDF para descargar.");
        }
    }

    /** Asigna los oyentes de eventos a los controles del visor. */
    function _attachEventListeners() {
        _elements.prevPageBtn.addEventListener('click', _onPrevPage);
        _elements.nextPageBtn.addEventListener('click', _onNextPage);
        _elements.zoomInBtn.addEventListener('click', _onZoomIn);
        _elements.zoomOutBtn.addEventListener('click', _onZoomOut);
        _elements.downloadPdfBtn.addEventListener('click', _onDownloadPdf);

        // Event listeners para gestos táctiles (zoom y paneo)
        _elements.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                _initialPinchDistance = _getPinchDistance(e);
                _initialScale = _scale;
            }
        }, { passive: true }); // Usar passive: true para mejorar rendimiento táctil

        _elements.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && _initialPinchDistance !== null) {
                e.preventDefault(); // Previene el scroll de la página al hacer zoom
                const currentPinchDistance = _getPinchDistance(e);
                const zoomFactor = currentPinchDistance / _initialPinchDistance;
                _scale = _initialScale * zoomFactor;
                _renderPage(_pageNum);
            }
        }, { passive: false }); // passive: false es necesario para preventDefault

        _elements.canvas.addEventListener('touchend', () => {
            _initialPinchDistance = null;
        });

        // Limpiar URL del objeto cuando el modal se cierra
        _elements.modal.addEventListener('hidden.bs.modal', () => {
            if (_currentPdfUrl) {
                URL.revokeObjectURL(_currentPdfUrl);
                _currentPdfUrl = null;
                _currentDownloadUrl = null;
                _pdfDoc = null; // Limpiar el documento PDF cargado
                _elements.canvas.getContext('2d').clearRect(0, 0, _elements.canvas.width, _elements.canvas.height); // Limpiar el canvas
            }
        });
    }

    /**
     * Muestra un modal personalizado en lugar de alert().
     * @param {string} title El título del mensaje.
     * @param {string} message El contenido del mensaje.
     */
    function _showMessageBox(title, message) {
        // Revisa si ya existe un modal de mensaje
        let messageBoxModalEl = document.getElementById('messageBoxModal');
        if (!messageBoxModalEl) {
            const modalHtml = `
                <div class="modal fade message-box-modal" id="messageBoxModal" tabindex="-1" aria-labelledby="messageBoxModalLabel" aria-hidden="true">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="messageBoxModalLabel">${title}</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                ${message}
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            messageBoxModalEl = document.getElementById('messageBoxModal');
            // Elimina el modal del DOM cuando se oculta
            messageBoxModalEl.addEventListener('hidden.bs.modal', function () {
                this.remove();
            });
        } else {
            // Actualiza el contenido si el modal ya existe
            messageBoxModalEl.querySelector('.modal-title').textContent = title;
            messageBoxModalEl.querySelector('.modal-body').innerHTML = message;
        }

        const messageModal = new bootstrap.Modal(messageBoxModalEl);
        messageModal.show();
    }

    /**
     * Carga el documento PDF desde la URL proporcionada.
     * @param {string} pdfUrl La URL del archivo PDF a cargar (puede ser Object URL o URL directa).
     * @param {string} [downloadUrl=pdfUrl] La URL a usar para la descarga (por defecto es pdfUrl).
     * @returns {Promise<boolean>} True si el PDF se cargó correctamente, false en caso contrario.
     */
    async function loadPdf(pdfUrl, downloadUrl = pdfUrl) {
        if (!pdfjsLib) {
            console.error("PDF.js no está cargado. Asegúrate de incluir pdf.min.js.");
            _showMessageBox("Error", "El visor de PDF no está completamente inicializado. Intente de nuevo.");
            return false;
        }

        _currentPdfUrl = pdfUrl;
        _currentDownloadUrl = downloadUrl;

        try {
            _pdfDoc = await pdfjsLib.getDocument(pdfUrl).promise;
            _elements.totalPagesSpan.textContent = _pdfDoc.numPages;
            _pageNum = 1; // Reinicia a la primera página al cargar un nuevo PDF
            _scale = 1.0; // Reinicia el zoom
            await _renderPage(_pageNum);
            return true;
        } catch (error) {
            console.error('Error al cargar el PDF:', error);
            _showMessageBox("Error", "No se pudo cargar el PDF. Detalles: " + error.message);
            return false;
        }
    }

    /**
     * Inicializa el módulo del visor de PDF, obteniendo las referencias del DOM
     * y configurando los listeners.
     * @param {object} options Opciones de configuración.
     * @param {string} options.modalId ID del modal principal del visor PDF.
     * @param {string} options.canvasId ID del elemento canvas.
     * @param {string} options.prevPageBtnId ID del botón "Anterior".
     * @param {string} options.nextPageBtnId ID del botón "Siguiente".
     * @param {string} options.zoomInBtnId ID del botón "Zoom In".
     * @param {string} options.zoomOutBtnId ID del botón "Zoom Out".
     * @param {string} options.downloadPdfBtnId ID del botón "Descargar PDF".
     * @param {string} options.currentPageSpanId ID del span de la página actual.
     * @param {string} options.totalPagesSpanId ID del span del total de páginas.
     * @param {string} options.pdfWorkerSrc URL del worker de PDF.js.
     * @returns {object} Objeto con funciones públicas para interactuar con el visor.
     */
    function createViewer(options) {
        // Asigna elementos del DOM
        _elements.modal = document.getElementById(options.modalId);
        _elements.canvas = document.getElementById(options.canvasId);
        _elements.ctx = _elements.canvas ? _elements.canvas.getContext('2d') : null;
        _elements.prevPageBtn = document.getElementById(options.prevPageBtnId);
        _elements.nextPageBtn = document.getElementById(options.nextPageBtnId);
        _elements.zoomInBtn = document.getElementById(options.zoomInBtnId);
        _elements.zoomOutBtn = document.getElementById(options.zoomOutBtnId);
        _elements.downloadPdfBtn = document.getElementById(options.downloadPdfBtnId);
        _elements.currentPageSpan = document.getElementById(options.currentPageSpanId);
        _elements.totalPagesSpan = document.getElementById(options.totalPagesSpanId);

        // Verifica que todos los elementos necesarios existan
        const requiredElements = [
            _elements.modal, _elements.canvas, _elements.ctx, _elements.prevPageBtn,
            _elements.nextPageBtn, _elements.zoomInBtn, _elements.zoomOutBtn,
            _elements.downloadPdfBtn, _elements.currentPageSpan, _elements.totalPagesSpan
        ];

        if (requiredElements.some(el => el === null)) {
            console.error("PDFViewerModule: Uno o más elementos del DOM requeridos no fueron encontrados.");
            _showMessageBox("Error de Inicialización", "Faltan elementos HTML para el visor PDF. Verifique las IDs.");
            return null; // No inicializar si faltan elementos
        }

        // Configura la ruta del worker de PDF.js (solo una vez)
        if (pdfjsLib && options.pdfWorkerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = options.pdfWorkerSrc;
        }

        _attachEventListeners();

        return {
            /**
             * Carga un PDF desde una URL directa y lo muestra en el visor.
             * @param {string} pdfUrl La URL directa al archivo PDF.
             * @param {string} [downloadUrl=pdfUrl] La URL para la descarga, si es diferente.
             */
            showPdfFromUrl: async (pdfUrl, downloadUrl = pdfUrl) => {
                const loadSuccess = await loadPdf(pdfUrl, downloadUrl);
                if (loadSuccess) {
                    const bsModal = new bootstrap.Modal(_elements.modal);
                    bsModal.show();
                }
            },

            /**
             * Fetches un PDF desde una API (que devuelve un blob) y lo muestra.
             * @param {string} apiUrl La URL del endpoint de la API.
             * @param {object} apiPayload El payload para la solicitud POST a la API.
             * @param {string} [downloadFileName='documento.pdf'] El nombre de archivo sugerido para la descarga.
             */
            showPdfFromApi: async (apiUrl, apiPayload, downloadFileName = 'documento.pdf') => {
                try {
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(apiPayload)
                    });

                    if (!response.ok) {
                        throw new Error(`Error HTTP: ${response.status} - ${response.statusText}`);
                    }

                    const blob = await response.blob();
                    const pdfObjectUrl = URL.createObjectURL(blob);
                    // Para la descarga, usamos la URL del API o una URL de blob temporal
                    // Si el backend te da un nombre de archivo, puedes usar response.headers.get('Content-Disposition')
                    const downloadUrl = pdfObjectUrl; // Usamos la URL del objeto para la descarga directa del blob

                    const loadSuccess = await loadPdf(pdfObjectUrl, downloadUrl);
                    if (loadSuccess) {
                        const bsModal = new bootstrap.Modal(_elements.modal);
                        bsModal.show();
                    } else {
                        // Si loadPdf falla, revocar Object URL inmediatamente
                        URL.revokeObjectURL(pdfObjectUrl);
                    }
                } catch (error) {
                    _showMessageBox("Error al cargar PDF", "No se pudo cargar el PDF desde la API. Detalles: " + error.message);
                    console.error("Error en showPdfFromApi:", error);
                }
            },

            // Puedes añadir más funciones públicas si las necesitas, por ejemplo, para cambiar de PDF dinámicamente
            // sin cerrar el modal.
        };
    }

    return {
        createViewer: createViewer,
        showMessageBox: _showMessageBox // Exponer si necesitas usarlo fuera del módulo para otros mensajes.
    };
})();