
var app = ( function() {

    var gl;
    var canvas;

    // Das Shaderprogramm speichert auch die Positionen der Attribute und Uniforms
    var prog;

    // Liste aller Modelle
    var models = [];

    // Modell, das über die Eingabe gesteuert wird
    var interactiveModel;

    // Zusätzliche Variablen für die Animation
    var spheres = [];
    var angle = 0;
    var animationRunning = false;
    var wireframeOnly = false;
    var lastTime = null;
    var animationFrameId = null;

    var camera = {
        // Startposition der Kamera
        eye : [0, 1, 4],
        // Punkt, auf den die Kamera schaut
        center : [0, 0, 0],
        // Oben-Richtung der Kamera
        up : [0, 1, 0],
        // Öffnungswinkel der Kamera im Bogenmaß
        // Umrechnung von Grad in Bogenmaß: Grad * PI / 180
        fovy : 60.0 * Math.PI / 180,
        // Größe des sichtbaren Ausschnitts
        // Wert für links, rechts, oben und unten bei der Projektion
        lrtb : 2.0,
        // Kameramatrix
        vMatrix : mat4.create(),
        // Projektionsmatrix
        pMatrix : mat4.create(),
        // Mögliche Projektionen: ortho, perspective und frustum
        projectionType : "perspective",
        // Winkel der Kamera zur Z-Achse beim Kreisen um den Mittelpunkt
        // Angabe im Bogenmaß
        zAngle : 0,
        // Abstand der Kamera zum Mittelpunkt in der XZ-Ebene
        distance : 4,
    };

    function start() {
        init();
        render();
    }

    function init() {
        initWebGL();
        initShaderProgram();
        initUniforms();
        initModels();
        initEventHandler();
        initPipline();
    }

    function initWebGL() {
        // WebGL-Kontext nach dem Grundgerüst aus TFM erstellen
        canvas = document.getElementById('canvas');
        gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
            throw new Error('WebGL wird nicht unterstützt.');
        }
        gl.viewportWidth = canvas.width;
        gl.viewportHeight = canvas.height;
    }

    /**
     * Feste Einstellungen für die Darstellung vorbereiten
     * Änderungen an Projektion oder Ansichtsbereich müssen
     * in der Funktion render berücksichtigt werden
     */
    function initPipline() {
        gl.clearColor(.95, .95, .95, 1);

        // Rückseiten der Flächen ausblenden
        gl.frontFace(gl.CCW);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);

        // Tiefentest aktivieren
        gl.enable(gl.DEPTH_TEST);

        // Kleinen Abstand für gefüllte Flächen festlegen
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(0.5, 0);

        // Zeichenbereich festlegen
        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

        // Kamera vorbereiten
        // Seitenverhältnis für die Projektion berechnen
        camera.aspect = gl.viewportWidth / gl.viewportHeight;
    }

    function initShaderProgram() {
        // Vertex-Shader erstellen
        var vs = initShader(gl.VERTEX_SHADER, "vertexshader");
        // Fragment-Shader erstellen
        var fs = initShader(gl.FRAGMENT_SHADER, "fragmentshader");
        // Beide Shader zu einem Programm verbinden
        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.bindAttribLocation(prog, 0, "aPosition");
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            throw new Error(gl.getProgramInfoLog(prog));
        }
        gl.useProgram(prog);
    }

    /**
     * Shader aus dem HTML-Quelltext erstellen und vorbereiten
     *
     * Parameter shaderType: Typ des Shaders
     * Parameter SourceTagId: ID des HTML-Elements mit dem Shader-Code
     * Rückgabe: der erstellte Shader
     */
    function initShader(shaderType, SourceTagId) {
        var shader = gl.createShader(shaderType);
        var shaderSource = document.getElementById(SourceTagId).text;
        gl.shaderSource(shader, shaderSource);
        gl.compileShader(shader);
        if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(SourceTagId + ': ' + gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    function initUniforms() {
        // Projektionsmatrix
        prog.pMatrixUniform = gl.getUniformLocation(prog, "uPMatrix");

        // Modell-View-Matrix
        prog.mvMatrixUniform = gl.getUniformLocation(prog, "uMVMatrix");

        // TFM-04: eigene Farbe für jedes Modell
        prog.colorUniform = gl.getUniformLocation(prog, "uColor");
    }

    function initModels() {
        // Modelle wie in TFM-01 und TFM-04 anlegen: Torus, Ebene und vier Kugeln
        var fs = 'fillwireframe';

        // Torus aus dem TFM-Beispiel für die Aufgabe vergrößern
        // Der Torus liegt in der XY-Ebene und hat seine Achse in Z-Richtung
        createModel('torus', fs, [1, 1, 1, 1],
            [0, 0, 0], [0.45, 0, 0], [2.1, 2.1, 2.1]);

        // Boden aus der vorgegebenen Geometriedatei
        createModel('plane', 'wireframe', [0.7, 0.75, 0.8, 1],
            [0, -1.85, 0], [0, 0, 0], [0.25, 0.25, 0.25]);

        // Farben aus TFM-04: Cyan, Magenta, Blau und Gelb
        var colors = [
            [0, 1, 1, 1],
            [1, 0, 1, 1],
            [0, 0, 1, 1],
            [1, 1, 0, 1]
        ];

        for (var i = 0; i < 4; i++) {
            var sphereModel = createModel('sphere', fs, colors[i],
                [0, 0, 0], [0, 0, 0], [0.12, 0.12, 0.12]);
            spheres.push(sphereModel);
        }

        interactiveModel = models[0];
        updateAnimation();
    }

    // Die vier Kugeln haben jeweils einen Winkelabstand von 90 Grad
    function updateAnimation() {
        interactiveModel.rotate[0] = 0.45 + angle * 0.5;
        for (var i = 0; i < spheres.length; i++) {
            var sphereAngle = angle + i * Math.PI / 2;
            spheres[i].translate[0] = 0.24 * Math.cos(sphereAngle);
            spheres[i].translate[1] = 0.24 * Math.sin(sphereAngle);
            spheres[i].translate[2] = 0;
        }
    }

    /**
     * Ein Modell erstellen, vorbereiten und in die Modellliste einfügen
     *
     * Parameter geometryname: Name der Geometrie
     * Parameter fillstyle: Darstellung als Linien, Flächen oder beides
     */
    function createModel(geometryname, fillstyle, color, translate, rotate, scale) {
        var model = {};
        model.geometryname = geometryname;
        model.fillstyle = fillstyle;
        model.color = color;
        initDataAndBuffers(model, geometryname);
        initTransformations(model, translate, rotate, scale);

        models.push(model);
        return model;
    }

    /**
     * Position, Drehung und Größe des Modells speichern
     */
    function initTransformations(model, translate, rotate, scale) {
        // Werte für die Transformation speichern
        model.translate = translate;
        model.rotate = rotate;
        model.scale = scale;

        // Modellmatrix erstellen
        model.mMatrix = mat4.create();

        // Modell-View-Matrix erstellen
        model.mvMatrix = mat4.create();
    }

    /**
     * Geometriedaten und Buffer für ein Modell vorbereiten
     *
     * Parameter model: Modell, das die Daten erhalten soll
     * Parameter geometryname: Name der Geometrie
     */
    function initDataAndBuffers(model, geometryname) {
        // Geometriedaten für das Modell erzeugen
        // Dabei werden folgende Arrays gefüllt
        // Punkte, Normalen sowie Indizes für Linien und Dreiecke
        // Die passende Funktion wird über window gefunden und für das Modell ausgeführt
        window[geometryname]['createVertexData'].apply(model);

        // Buffer für die Positionen anlegen
        model.vboPos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, model.vboPos);
        gl.bufferData(gl.ARRAY_BUFFER, model.vertices, gl.STATIC_DRAW);

        // Positionsdaten mit dem Attribut verbinden
        prog.positionAttrib = gl.getAttribLocation(prog, 'aPosition');
        gl.enableVertexAttribArray(prog.positionAttrib);

        // Buffer für die Normalen anlegen
        model.vboNormal = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, model.vboNormal);
        gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);
        // Normalendaten mit dem Attribut verbinden
        prog.normalAttrib = gl.getAttribLocation(prog, 'aNormal');
        gl.enableVertexAttribArray(prog.normalAttrib);

        // Index-Buffer für die Linien anlegen
        model.iboLines = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboLines);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indicesLines,
            gl.STATIC_DRAW);
        model.iboLines.numberOfElements = model.indicesLines.length;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        // Index-Buffer für die Dreiecke anlegen
        model.iboTris = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, model.indicesTris,
            gl.STATIC_DRAW);
        model.iboTris.numberOfElements = model.indicesTris.length;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }

    function initEventHandler() {
        // Schrittweite für die Kameradrehung
        var deltaRotate = Math.PI / 36;
        var deltaTranslate = 0.05;

        window.onkeydown = function(evt) {
            var key = evt.which ? evt.which : evt.keyCode;
            var c = String.fromCharCode(key);
            // Mit Umschalt die Richtung umkehren
            var sign = evt.shiftKey ? -1 : 1;

            // Projektion der Szene wechseln
            switch(c) {
                case('O'):
                    camera.projectionType = "ortho";
                    camera.lrtb = 2;
                    break;
                case('F'):
                    camera.projectionType = "frustum";
                    camera.lrtb = 1.2;
                    break;
                case('P'):
                    camera.projectionType = "perspective";
                    break;
            }
            // Kamera bewegen und drehen
            switch(c) {
                case('C'):
                    // Kamera um den Mittelpunkt drehen
                    camera.zAngle += sign * deltaRotate;
                    break;
                case('H'):
                    // Kamera nach oben oder unten bewegen
                    camera.eye[1] += sign * deltaTranslate;
                    break;
                case('D'):
                    // Abstand der Kamera zum Mittelpunkt ändern
                    camera.distance += sign * deltaTranslate;
                    break;
                case('V'):
                    // Öffnungswinkel der Kamera ändern
                    camera.fovy += sign * 5 * Math.PI / 180;
                    break;
                case('B'):
                    // Größe des sichtbaren Ausschnitts ändern
                    camera.lrtb += sign * 0.1;
                    break;
            }
            // Mit K einen Animationsschritt ausführen
            if (c === 'K') {
                evt.preventDefault();
                moveStep();
                return;
            }
            // Nach einer Kameraeingabe die Szene neu zeichnen
            render();
        };
    }

    /**
     * Die Szene zeichnen
     */
    function render() {
        // Zeichenfläche und Tiefenbuffer leeren
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        setProjection();

        calculateCameraOrbit();

        // Kameramatrix anhand der Kameraposition berechnen
        mat4.lookAt(camera.vMatrix, camera.eye, camera.center, camera.up);

        // Alle Modelle nacheinander zeichnen
        for(var i = 0; i < models.length; i++) {
            // Modell-View-Matrix für das Modell aktualisieren
            updateTransformations(models[i]);

            // Modellmatrix und Farbe an die Shader übergeben
            gl.uniformMatrix4fv(prog.mvMatrixUniform, false,
                models[i].mvMatrix);
            gl.uniform4fv(prog.colorUniform, models[i].color);

            draw(models[i]);
        }
    }

    function calculateCameraOrbit() {
        // X- und Z-Position der Kamera beim Kreisen berechnen
        var x = 0, z = 2;
        camera.eye[x] = camera.center[x];
        camera.eye[z] = camera.center[z];
        camera.eye[x] += camera.distance * Math.sin(camera.zAngle);
        camera.eye[z] += camera.distance * Math.cos(camera.zAngle);
    }

    function setProjection() {
        // Projektionsmatrix berechnen
        switch(camera.projectionType) {
            case("ortho"):
                var v = camera.lrtb;
                mat4.ortho(camera.pMatrix, -v, v, -v, v, -10, 10);
                break;
            case("frustum"):
                var v = camera.lrtb;
                mat4.frustum(camera.pMatrix, -v/2, v/2, -v/2, v/2, 1, 10);
                break;
            case("perspective"):
                mat4.perspective(camera.pMatrix, camera.fovy,
                    camera.aspect, 1, 10);
                break;
        }
        // Projektionsmatrix an den Shader übergeben
        gl.uniformMatrix4fv(prog.pMatrixUniform, false, camera.pMatrix);
    }

    /**
     * Modell-View-Matrix für ein Modell berechnen
     */
    function updateTransformations(model) {
        var mMatrix = model.mMatrix;
        var mvMatrix = model.mvMatrix;

        // Reihenfolge aus TFM-02: Verschiebung, Drehung und Skalierung
        mat4.identity(mMatrix);
        mat4.identity(mvMatrix);
        mat4.translate(mMatrix, mMatrix, model.translate);
        mat4.rotateX(mMatrix, mMatrix, model.rotate[0]);
        mat4.rotateY(mMatrix, mMatrix, model.rotate[1]);
        mat4.rotateZ(mMatrix, mMatrix, model.rotate[2]);
        mat4.scale(mMatrix, mMatrix, model.scale);
        mat4.multiply(mvMatrix, camera.vMatrix, mMatrix);
    }

    function draw(model) {
        // Positions-Buffer zum Zeichnen verwenden
        gl.bindBuffer(gl.ARRAY_BUFFER, model.vboPos);
        gl.vertexAttribPointer(prog.positionAttrib, 3, gl.FLOAT, false,
            0, 0);

        // Normalen-Buffer zum Zeichnen verwenden
        gl.bindBuffer(gl.ARRAY_BUFFER, model.vboNormal);
        gl.vertexAttribPointer(prog.normalAttrib, 3, gl.FLOAT, false, 0, 0);

        // Dreiecke zeichnen, wenn Flächen angezeigt werden sollen
        var fill = (model.fillstyle.search(/fill/) != -1);
        if(fill) {
            gl.enableVertexAttribArray(prog.normalAttrib);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboTris);
            gl.drawElements(gl.TRIANGLES, model.iboTris.numberOfElements,
                gl.UNSIGNED_SHORT, 0);
        }

        // Linien zeichnen, wenn das Liniennetz angezeigt werden soll
        var wireframe = (model.fillstyle.search(/wireframe/) != -1);
        if(wireframe) {
            gl.disableVertexAttribArray(prog.normalAttrib);
            // Die Normale -1 sorgt im TFM-Shader für schwarze Gitterlinien
            gl.vertexAttrib3f(prog.normalAttrib, 0, 0, -1);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model.iboLines);
            gl.drawElements(gl.LINES, model.iboLines.numberOfElements,
                gl.UNSIGNED_SHORT, 0);
        }
    }

    // Einen Schritt über die Taste K oder den Button ausführen
    function moveStep() {
        if (animationRunning) {
            return;
        }
        angle += 0.12;
        updateAnimation();
        render();
    }

    // Automatische Animation starten oder stoppen
    function toggleAnimation() {
        animationRunning = !animationRunning;
        document.getElementById('animationButton').textContent =
            animationRunning ? 'Animation stoppen' : 'Animation starten';
        if (animationRunning) {
            lastTime = null;
            animationFrameId = requestAnimationFrame(animate);
        } else if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    // Bewegung mit requestAnimationFrame an die Zeit anpassen
    function animate(time) {
        if (!animationRunning) {
            return;
        }
        if (lastTime !== null) {
            var delta = Math.min((time - lastTime) / 1000, 0.05);
            angle += delta;
        }
        lastTime = time;
        updateAnimation();
        render();
        animationFrameId = requestAnimationFrame(animate);
    }

    // Zwischen Flächen mit Liniennetz und reinen Linien wechseln
    function toggleMode() {
        wireframeOnly = !wireframeOnly;
        for (var i = 0; i < models.length; i++) {
            if (models[i].geometryname !== 'plane') {
                models[i].fillstyle = wireframeOnly ? 'wireframe' : 'fillwireframe';
            }
        }
        document.getElementById('modeInfo').textContent =
            wireframeOnly ? 'Darstellung: Linien' : 'Darstellung: Füllung mit Liniennetz';
        render();
    }

    // Öffentliche Funktionen des app-Moduls wie im TFM-Grundgerüst bereitstellen
    return {
        start: start,
        moveStep: moveStep,
        toggleAnimation: toggleAnimation,
        toggleMode: toggleMode
    };

}());
