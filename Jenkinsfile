pipeline {
    agent any

    parameters {
        booleanParam(name: 'PUBLISH_OTA', defaultValue: false, description: '¿Generar y publicar nueva versión OTA de Expo?')
    }

    environment {
        API_DIR = 'apps/api'
        WEB_DIR = 'apps/web'
        DEPLOY_DIR = 'deploy'
    }

    stages {
        stage('Lint & Test') {
            steps {
                dir("${API_DIR}") {
                    echo 'Running tests...'
                    sh 'go test -v ./...'
                }
            }
        }

        stage('Prepare Environment') {
            steps {
                dir("${DEPLOY_DIR}") {
                    echo 'Preparing .env file...'
                    script {
                        // Create .env from template
                        sh 'cp .env.template .env'
                        
                        // Replace secrets with environment credentials if defined in Jenkins
                        // You should define 'ski-tracker-jwt-secret' and 'ski-tracker-ota-secret' in Jenkins Credentials
                        try {
                            withCredentials([
                                string(credentialsId: 'ski-tracker-jwt-secret', variable: 'JWT_SECRET_CRED'),
                                string(credentialsId: 'ski-tracker-ota-secret', variable: 'OTA_PUBLISH_SECRET_CRED')
                            ]) {
                                sh """
                                    sed -i 's|^JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET_CRED}|' .env
                                    sed -i 's|^OTA_PUBLISH_SECRET=.*|OTA_PUBLISH_SECRET=${OTA_PUBLISH_SECRET_CRED}|' .env
                                """
                            }
                        } catch (err) {
                            echo 'Warning: Jenkins credentials not found or failed to load. Using template defaults (recommended for development only).'
                        }
                    }
                }
            }
        }

        stage('Docker Build') {
            steps {
                dir("${DEPLOY_DIR}") {
                    echo 'Building API Docker image via Docker Compose...'
                    sh 'docker compose build api'
                }
            }
        }

        stage('Docker Deploy') {
            steps {
                dir("${DEPLOY_DIR}") {
                    echo 'Deploying services with Docker Compose...'
                    sh 'docker compose up -d'
                    echo 'Cleaning up dangling images...'
                    sh 'docker image prune -f'
                }
            }
        }

        stage('Expo OTA Export & Publish') {
            when {
                expression { params.PUBLISH_OTA == true }
            }
            steps {
                dir("${WEB_DIR}") {
                    echo 'Installing dependencies using pnpm...'
                    sh 'pnpm install'

                    echo 'Exporting Expo OTA bundle...'
                    sh 'pnpm run export:ota'

                    echo 'Zipping the OTA bundle...'
                    sh 'cd dist-ota && zip -r ../bundle.zip . && cd ..'

                    echo 'Detecting version from app.json...'
                    script {
                        def version = sh(script: "node -p \"require('./app.json').expo.version\"", returnStdout: true).trim()
                        echo "Version detected: ${version}"
                        
                        // Send the zip bundle to the publish API endpoint
                        withCredentials([
                            string(credentialsId: 'ski-tracker-ota-secret', variable: 'OTA_PUBLISH_SECRET_CRED')
                        ]) {
                            sh """
                                # Load URL from .env if it exists
                                if [ -f ../../deploy/.env ]; then
                                    export \$(cat ../../deploy/.env | grep -v '#' | xargs)
                                fi
                                TARGET_API_URL=\${API_PUBLIC_URL:-http://localhost:8082}
                                
                                echo "Publishing OTA update to \${TARGET_API_URL}..."
                                curl -X POST "\${TARGET_API_URL}/api/v1/ota/publish" \
                                  -H "Authorization: Bearer \${OTA_PUBLISH_SECRET_CRED}" \
                                  -F "bundle=@bundle.zip" \
                                  -F "runtime_version=\${version}" \
                                  -F "version=\${version}"
                            """
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo 'Deployment completed successfully!'
        }
        failure {
            echo 'Deployment failed. Please check the logs.'
        }
    }
}
