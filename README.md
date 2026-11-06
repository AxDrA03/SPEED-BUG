# SPEED-BUG - Sistema de Asistencia QR 🐍📊

Sistema web ligero para el control de asistencia mediante códigos QR, desarrollado específicamente para la **Semana de Matemáticas de la Universidad de Sonora (UNISON)**. 

Este proyecto permite a los administradores registrar la asistencia de los estudiantes escaneando sus códigos QR en tiempo real, mientras ofrece a los alumnos un portal responsivo para consultar sus faltas y su código de acceso.

## 🚀 Características Principales

* **Portal de Alumnos:** Acceso seguro mediante Expediente y NIP. Visualización del código QR dinámico y consulta de asistencias/faltas por curso.
* **Panel de Administración:** Interfaz protegida para gestionar cursos, registrar nuevos alumnos (con generación automática de NIP) y tomar asistencia.
* **Escáner Integrado:** Lectura de códigos QR en tiempo real utilizando la cámara del dispositivo, con opción de registro manual por expediente.
* **Diseño Institucional:** Interfaz *mobile-first* construida con CSS Grid y metodología BEM, adaptada a la identidad visual de la UNISON.
* **Backend Ligero:** Servidor HTTP nativo en Python que no requiere frameworks pesados (sin Flask ni Django), conectado a una base de datos local SQLite.

## 🛠️ Tecnologías Utilizadas

**Frontend:**
* HTML5
* CSS3 (CSS Grid, metodología BEM)
* JavaScript (Vanilla)

**Backend:**
* Python 3 (`http.server`, `hashlib`, `sqlite3`)
* OpenCV (`cv2`) y NumPy (Procesamiento y lectura de QR)
* Base de datos: SQLite3 (`asistencia.db`)

## ⚙️ Instalación y Ejecución Local

### 1. Requisitos previos
Asegúrate de tener Python 3 instalado en tu sistema. Además, necesitarás las librerías para procesar las imágenes de los códigos QR.

En distribuciones basadas en Debian/Ubuntu (como Linux Mint):
```bash
sudo apt install python3-opencv
```
O mediante gestor de paquetes de Python:
```bash
pip3 install opencv-python numpy
```

### 2. Clonar el repositorio
```bash
git clone [https://github.com/AxDrA03/SPEED-BUG.git](https://github.com/AxDrA03/SPEED-BUG.git)
cd SPEED-BUG
```

### 3. Levantar el servidor
Ejecuta el archivo principal del backend. Por defecto, el servidor se levantará en el puerto `8000`.
```bash
python3 server.py
```

### 4. Accesos a la plataforma
Una vez que el servidor esté corriendo, abre tu navegador web en las siguientes direcciones:
* **Vista de Alumnos:** http://localhost:8000/
* **Vista de Administradores:** http://localhost:8000/admin

*Nota: Al iniciar el servidor por primera vez, la terminal imprimirá un "Código para registrar administradores". Cópialo y úsalo en la ruta `/admin` para crear tu primera cuenta de administrador.*

## 📂 Estructura del Proyecto

* `server.py`: Lógica del servidor web nativo, endpoints de la API y conexión a la base de datos.
* `qr_reader.py`: Script auxiliar para la decodificación de imágenes y lectura de códigos QR.
* `index.html`: Portal principal para estudiantes.
* `admin.html`: Panel de control para administradores.
* `usuario.js` / `admin.js`: Controladores del frontend para peticiones API y manejo del DOM.
* `styles.css`: Hoja de estilos global e institucional.

## 👥 Equipo de Desarrollo (SPEED-BUG)

* **Axel Daniel Arredondo** - Coordinador
* **Leyva** - Coordinador
* **Santiago Payán Ibarra** - Frontend & UI/UX
* **Kevin Eduardo Rivera** - Backend
* **José Francisco Vega** - Frontend
* **Manuel Busani Yanes** - Base de Datos
