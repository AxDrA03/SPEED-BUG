function showQR() {
    // Captura el número que escribió el usuario
    const expediente = document.getElementById('expedienteInput').value;
    
    // Selecciona la etiqueta de imagen del QR
    const qrImage = document.querySelector('.qr-card__image');
    
    // Cambia la URL inyectando el número de expediente real
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${expediente}`;
    
    // Muestra el contenedor
    const displayContainer = document.getElementById('qrDisplay');
    displayContainer.classList.add('qr-card__display--active');
}