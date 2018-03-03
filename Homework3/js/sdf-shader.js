var sphereDFVShader = `
    varying vec3 v_pos;

    void main() {
        v_pos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

var sphereDFFShader = `

    const int MAX_STEPS = 255;
    const float EPSILON = 0.0001;
    const float START = 0.0;
    const float END = 100.0;

    varying vec3 v_pos;
    uniform vec2 resolution;
    uniform float time;
    uniform float Ball_Speed;
    uniform float Hole_Speed;

    mat3 rotateX(float theta){
        float c = cos(theta);
        float s = sin(theta);
        return mat3(
            vec3(1, 0, 0),
            vec3(0, c, -s),
            vec3(0, s, c)
        );
    }

    mat3 rotateY(float theta){
        float c = cos(theta);
        float s = sin(theta);
        return mat3(
            vec3(c, 0, s),
            vec3(0, 1, 0),
            vec3(-s, 0, c)
        );
    }

    mat3 rotateZ(float theta){
        float c = cos(theta);
        float s = sin(theta);
        return mat3(
            vec3(c, -s, 0),
            vec3(s, c, 0),
            vec3(0, 0, 1)
        );
    }

    float intersectSDF(float distA, float distB){
        return max(distA, distB);
    }

    float unionSDF(float distA, float distB){
        return min(distA, distB);
    }

    float differenceSDF(float distA, float distB){
        return max(distA, -distB);
    }

    float boxSDF(vec3 pos, vec3 size){
        vec3 d = abs(pos) - (size/2.0);

        float insideDistance = min(max(d.x, max(d.y, d.z)), 0.0);

        float outsideDistance = length(max(d, 0.0));

        return insideDistance + outsideDistance;
    }

    float sphereSDF(vec3 pos, float r) {
        return length(pos) - r;
    }

    float cylinderSDF(vec3 pos, float h, float r){
        float inOutRadius = length(pos.xy) - r;

        float inOutHeight = abs(pos.z) - h/2.0;

        float insideDistance = min(max(inOutRadius, inOutHeight), 0.0);

        float outsideDistance = length(max(vec2(inOutRadius, inOutHeight), 0.0));

        return insideDistance + outsideDistance;
    }

    float sceneSDF(vec3 pos){
        pos = rotateY(time/2.0) * pos;

        float cylinderRadius = 0.4 + (1.0 - 0.4) * (1.0 + sin(Hole_Speed * time)) / 2.0;
        float cylinder1 = cylinderSDF(pos, 2.0, cylinderRadius);
        float cylinder2 = cylinderSDF(rotateX(radians(90.0)) * pos, 2.0, cylinderRadius);
        float cylinder3 = cylinderSDF(rotateY(radians(90.0)) * pos, 2.0, cylinderRadius);

        float cube = boxSDF(pos, vec3(1.8, 1.8, 1.8));

        float sphere = sphereSDF(pos, 1.2);

        float ballOffset = 0.4 + 1.0 + sin(Ball_Speed * time);
        float ballRadius = 0.3;
        float balls = sphereSDF(pos - vec3(ballOffset, 0.0, 0.0), ballRadius);
        balls = unionSDF(balls, sphereSDF(pos + vec3(ballOffset, 0.0, 0.0), ballRadius));
        balls = unionSDF(balls, sphereSDF(pos - vec3(0.0, ballOffset, 0.0), ballRadius));
        balls = unionSDF(balls, sphereSDF(pos + vec3(0.0, ballOffset, 0.0), ballRadius));
        balls = unionSDF(balls, sphereSDF(pos - vec3(0.0, 0.0, ballOffset), ballRadius));
        balls = unionSDF(balls, sphereSDF(pos + vec3(0.0, 0.0, ballOffset), ballRadius));

        float csgNut = differenceSDF(intersectSDF(cube, sphere),
                                    unionSDF(cylinder1, unionSDF(cylinder2, cylinder3)));

        return unionSDF(balls, csgNut);
    }

    // ray marching function
    float rayMarch(vec3 cam, vec3 dir, float start, float end) {
        float step = start;

        for(int i = 0; i < MAX_STEPS; ++i) {
            float dist = sceneSDF(cam + step * dir);
            if(dist < EPSILON) {
                return step;
            }

            step += dist;
            if(step >= end) {
                return end;
            }
        }

        return end;
    }

    vec3 rayDirection(float fieldOfView, vec2 size, vec2 fragCoord) {
        vec2 xy = fragCoord;
        float z = size.y / tan(radians(fieldOfView) / 2.0);
        return normalize(vec3(xy, -z));
    }

    vec3 estimateNormal(vec3 p){
        return normalize(vec3(
            sceneSDF(vec3(p.x + EPSILON, p.y, p.z)) - sceneSDF(vec3(p.x - EPSILON, p.y, p.z)),
            sceneSDF(vec3(p.x, p.y + EPSILON, p.z)) - sceneSDF(vec3(p.x, p.y - EPSILON, p.z)),
            sceneSDF(vec3(p.x, p.y, p.z  + EPSILON)) - sceneSDF(vec3(p.x, p.y, p.z - EPSILON))
        ));
    }

    vec3 phongContribForLight(vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 cam, vec3 lightPos, vec3 lightIntensity){
        vec3 N = estimateNormal(p);
        vec3 L = normalize(lightPos - p);
        vec3 V = normalize(cam - p);
        vec3 R = normalize(reflect(-L, N));

        float dotLN = dot(L, N);
        float dotRV = dot(R, V);

        if(dotLN < 0.0) return vec3(0.0, 0.0, 0.0);

        if(dotRV < 0.0) return lightIntensity * (k_d * dotLN);

        return lightIntensity * (k_d * dotLN + k_s * pow(dotRV, alpha));
    }

    vec3 PhongIllumination(vec3 k_a, vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 cam){
        const vec3 ambientLight = 0.5 * vec3(1.0, 1.0, 1.0);
        vec3 color = ambientLight * k_a;

        vec3 light1Pos = vec3(4.0 * sin(time), 2.0, 4.0 * cos(time));
        vec3 light1Intensity = vec3(0.6, 0.6, 0.6);

        color += phongContribForLight(k_d, k_s, alpha, p, cam, light1Pos, light1Intensity);

        vec3 light2Pos = vec3(2.0 * sin(0.37 * time), 2.0 * cos(0.37 * time), 2.0);
        vec3 light2Intensity = vec3(0.6, 0.6, 0.6);

        color += phongContribForLight(k_d, k_s, alpha, p, cam, light2Pos, light2Intensity);

        return color;
    }

    mat4 view(vec3 cam, vec3 center, vec3 up){
        vec3 f = normalize(center - cam);
        vec3 s = normalize(cross(f, up));
        vec3 u = cross(s, f);

        return mat4(vec4(s, 0.0),
                    vec4(u, 0.0),
                    vec4(-f, 0.0),
                    vec4(0.0, 0.0, 0.0, 1));
    }

    void main() {

        vec3 viewDir = rayDirection(45.0, resolution, v_pos.xy);
        vec3 cam = vec3(8.0, 5.0, 7.0);

        mat4 viewToWorld = view(cam, vec3(0.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0));

        vec3 worldDir = (viewToWorld * vec4(viewDir, 0.0)).xyz;

        float dist = rayMarch(cam, worldDir, START, END);

        if(dist > END - EPSILON) {
            gl_FragColor = vec4(0.0,0.0,1.0,0.0);
            return;
        }

        vec3 p = cam + dist * worldDir;

        vec3 K_a = vec3(0.2, 0.2, 0.2);
        vec3 K_d = vec3(0.7, 0.2, 0.2);
        vec3 K_s = vec3(1.0, 1.0, 1.0);
        float shininess = 100.0;

        vec3 color = PhongIllumination(K_a, K_d, K_s, shininess, p, cam);

        gl_FragColor = vec4(color, 1.0);
    }
`;
