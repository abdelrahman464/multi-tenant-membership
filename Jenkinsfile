pipeline {
  agent any

  stages {
    stage('Test') {
      steps {
        sh 'npm ci'
        sh 'npm test'
        sh 'npm run build'
      }
    }

    stage('Deploy') {
      steps {
        sh 'ansible-playbook ansible/playbook.yml'
      }
    }
  }
}
