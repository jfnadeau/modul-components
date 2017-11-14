pipeline {
    agent any

    options {
        // Discarter après 10 builds
        buildDiscarder(logRotator(numToKeepStr: '10'))

        // Ajouter les timestamps dans le log
        timestamps()
    }

    environment {
        // Pour éviter une erreur: EACCES: permission denied, mkdir '/.npm'
        PATH = '/usr/local/bin:/usr/bin'
        npm_config_cache = 'npm-cache'
        DOCKER_REPOSITORY = 'docker-local.maven.at.ulaval.ca/modul'
        DOCKER_REPOSITORY_URL = 'https://docker-local.maven.at.ulaval.ca'
    }

    stages {
        stage('Build') {
            agent {
                docker {
                    image 'node:8.2-alpine'
                    reuseNode true
                }
            }

            steps {
                echo 'Building...'
                sh 'pwd'
                echo 'Clean up...'
                sh 'rm -rf dist'
                sh 'rm -rf node_modules'

                echo 'Initializing npm...'
                sh 'npm install'

                echo 'Building...'
                sh 'npm run buildWebpack'
            }
        }
        stage('Test') {
            steps {
                echo 'Testing..'
            }
        }
    }

    post {
        always {
            echo 'Success'
            println currentBuild.result
        }
        failure {
            echo 'Failure'
            println currentBuild.result
            step([$class: 'Mailer', notifyEveryUnstableBuild: true, recipients: 'martin.simard@dti.ulaval.ca', sendToIndividuals: true])
        }
    }
}