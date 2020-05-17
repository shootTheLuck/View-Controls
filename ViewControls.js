
var easeInOutQuart  = function (t) { return t<.5 ? 8*t*t*t*t : 1-8*(--t)*t*t*t };
var easeInOutLinear = function (t) { return t<.5 ? 2*t : 2*(1-t) }; //mod

var myMath = {};
myMath.nearlyEquals = function(v1, v2, tolerance = 0.002) {
    if (Math.abs(v1.x - v2.x) +
        Math.abs(v1.y - v2.y) +
        Math.abs(v1.z - v2.z) < tolerance) {
        return v1;
    } else {
        return false;
    }

};


myMath.easeBetween = function(v1, v2, easingFunction, interval) {
    this.x = v1.x + (v2.x - v1.x) * easingFunction(interval);
    this.y = v1.y + (v2.y - v1.y) * easingFunction(interval);
    return this;
};

THREE.Vector3.prototype.easeTo = function(v1, easingFunction, interval) {
    this.x += (v1.x - this.x) * easingFunction(interval);
    this.y += (v1.y - this.y) * easingFunction(interval);
    this.z += (v1.z - this.z) * easingFunction(interval);
    return this;
};

THREE.Quaternion.prototype.easeTo = function(v1, easingFunction, interval) {
    this.x += (v1.x - this.x) * easingFunction(interval);
    this.y += (v1.y - this.y) * easingFunction(interval);
    this.z += (v1.z - this.z) * easingFunction(interval);
    return this;
};


myMath.clamp = function(number, min, max) {
    return Math.min(Math.max(number, min), max);
};

class RaycasterHelper {

    constructor() {
        this.raycaster = new THREE.Raycaster();
        this.intersects = [];
        this.mouseCoords = {x: 0, y: 0};
    }

    pick(evt, object, camera, ignoreProperty) {
        this.mouseCoords.x = (evt.clientX / evt.target.clientWidth) * 2 - 1;
        this.mouseCoords.y = -(evt.clientY / evt.target.clientHeight) * 2 + 1;
        this.raycaster.setFromCamera(this.mouseCoords, camera);
        this.intersects.length = 0;

        if (Array.isArray(object)) {
            this.raycaster.intersectObjects(object, true, this.intersects);
        } else {
            this.raycaster.intersectObject(object, true, this.intersects);
        }

        if (this.intersects.length) {
            var index = 0;
            if (ignoreProperty) {
                while (index < this.intersects.length &&
                    this.intersects[index].object[ignoreProperty]) {
                    index ++;
                }
            }
            if (this.intersects[index]) {
                return this.intersects[index];
            }
        }
        return false;
    }
}


class ViewControls extends THREE.Object3D {

    constructor(camera, scene, domElement, opts = {}) {
        super();
        this.name = opts.name || "viewControls";
        this.camera = camera;
        this.scene = scene;
        this.domElement = domElement;
        // make sure element can receive keys.
        if (this.domElement.tabIndex === -1) {
            this.domElement.tabIndex = 0;
        }
        this.outer = new THREE.Object3D();
        this.outer.name = "outer";
        this.add(this.outer);

        this.ray = new RaycasterHelper();
        this.autoReturn = (opts.autoReturn !== undefined)? opts.autoReturn : true;
        this.oldPosition = camera.position.clone();
        this.oldQuaternion = camera.quaternion.clone();
        this.oldParent = camera.parent || scene;

        this.maxDollySpeed = opts.maxDollySpeed || Infinity;
        this.focusIncrement = 0;
        this.focusSpeed = 0.03;

        this.wheelDollySpeed = 0.03;
        this.rotationSpeed = opts.rotationSpeed || 0.005;
        this.focusMatrix = new THREE.Matrix4();
        this.focusQuaternion = new THREE.Quaternion();
        this.focused = false;
        this.animation = null;
        this.focusIterations = 0;
        this.maxFocusIterations = 20;

        this.mouseMoveListener = this.handleMouseMove.bind(this);
        this.mouseUpListener = this.handleMouseUp.bind(this);
        this.keyDownListener = this.handleKeyDown.bind(this);
        this.keyUpListener = this.handleKeyUp.bind(this);

        this.domElement.addEventListener("mousedown", this.handleMouseDown.bind(this));
        this.domElement.addEventListener("wheel", this.handleMouseWheel.bind(this));
        this.domElement.addEventListener("contextmenu", (evt) => {
            evt.preventDefault();
        });

        if (this.autoReturn) {
            this.domElement.addEventListener("keydown", this.handleKeyDown.bind(this), false);
        }

        this.touchEvent = {type: "touch", object: null};
        this.scene.add(this);
    }

    handleMouseDown(evt) {
        let ignoreProperty = "isPartOfTransformControls";
        let intersects = this.ray.pick(evt, this.scene, this.camera, ignoreProperty);
        if (!intersects.object) return;

        if (evt.button === 0) {
            if (evt.altKey) {
                this.domElement.requestPointerLock();
                this.domElement.addEventListener("mousemove", this.mouseMoveListener);
                this.domElement.addEventListener("mouseup", this.mouseUpListener);
                this.domElement.addEventListener("keyup", this.keyUpListener);
                this.unFocus(this.camera, this.scene);
                this.startFocus(this.camera, intersects.point);
            } else {
                this.dispatchEvent({type: "leftClick", detail: intersects});
            }
        }

        if (evt.button === 2) {
            this.dispatchEvent({type: "rightClick", detail: intersects});
        }
    }

    handleMouseMove(evt) {
        if (evt.ctrlKey) {
            this.rotate(evt.movementY * this.rotationSpeed, evt.movementX * this.rotationSpeed);
        } else {
            this.rotate(0, evt.movementX * this.rotationSpeed);
            this.dolly(this.camera, evt.movementY * this.rotationSpeed);
        }
    }

    handleMouseUp(evt) {
        this.exit();
    }

    handleMouseWheel(evt) {
        evt.preventDefault();
        var dist = this.camera.position.distanceTo(this.outer.position);
        var dollyAmount = myMath.clamp(evt.deltaY * dist * this.wheelDollySpeed, -this.maxDollySpeed, this.maxDollySpeed);
        this.camera.translateZ(dollyAmount);
        this.camera.position.z = Math.max(0, this.camera.position.z);
    }

    handleKeyUp(evt) {
        if (evt.key === "Alt") {
            this.exit();
        }
    }

    handleKeyDown(evt) {
        if (evt.key === "Escape") {
            this.unFocus(this.camera, this.scene);
            this.resetCamera(this.camera, this.oldPosition, this.oldQuaternion);
            this.exit();
        }
    }

    update() {
        if (this.animation) {
            this.animation();
        }
    }

    rotate(x, y) {
        if (this.focused) {
            this.rotateY(-y);
            this.outer.rotateX(-x);
        }
    }

    dolly(camera, y) {
        if (this.focused) {
            var dist = camera.position.distanceTo(this.outer.position);
            var dollyAmount = myMath.clamp(y * dist, -this.maxDollySpeed, this.maxDollySpeed);
            camera.translateZ(dollyAmount);
            camera.position.z = Math.max(0, camera.position.z);
        }
    }

    panToObject(camera, position) {
        camera.quaternion.slerp(this.focusQuaternion, this.focusIncrement);
        this.focusIncrement += this.focusSpeed;
        this.focusIterations += 1;
        if (myMath.nearlyEquals(camera.quaternion, this.focusQuaternion) ||
                this.focusIterations > this.maxFocusIterations) {
            this.focused = true;
            this.focusIncrement = 0;
            this.position.copy(position);
            this.outer.lookAt(camera.position);
            this.outer.attach(camera);
            this.animation = null;
        } else {
            // this.animation = requestAnimationFrame(this.panToObject.bind(this, camera, position));
            this.animation = this.panToObject.bind(this, camera, position);
        }
    }

    startFocus(camera, position) {
        this.focusIterations  = 0;
        this.focusMatrix.lookAt(camera.position, position, camera.up);
        this.focusQuaternion.setFromRotationMatrix(this.focusMatrix);
        this.panToObject(camera, position);
    }

    unFocus(camera, scene) {
        this.focusIncrement = 0;
        this.focused = false;
        // cancelAnimationFrame(this.animation);
        this.oldParent.attach(camera);
    }

    resetCamera(camera, position, quaternion) {
        if (myMath.nearlyEquals(camera.position, position)) {
            camera.position.copy(position);
            camera.quaternion.copy(quaternion);
            this.animation = null;
        } else {
            // this.animation = requestAnimationFrame(this.resetCamera.bind(this, camera, position, quaternion));
            this.animation = this.resetCamera.bind(this, camera, position, quaternion); // TODO if (!this.animation)
            camera.position.lerp(position, 0.11);
            camera.quaternion.slerp(quaternion, 0.11);
        }
    }

    exit() {
        document.exitPointerLock();
        this.domElement.removeEventListener("mousemove", this.mouseMoveListener);
        this.domElement.removeEventListener("mouseup", this.mouseUpListener);
        this.domElement.removeEventListener("keyup", this.keyUpListener);
    }
}