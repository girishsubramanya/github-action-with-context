"""
Version: v1
Date: 2025-12-23
Design, Author, Updated by: Girish Subramanya <girish.subramanya@daimlertruck.com>, VCP, B&I, DTICI
"""
import unittest
import json
from app import app

from app import app, db, User
from flask_bcrypt import Bcrypt

class WorkflowGeneratorTestCase(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True
        app.config['WTF_CSRF_ENABLED'] = False
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'

        self.bcrypt = Bcrypt(app)
        with app.app_context():
            db.create_all()
            # Create a user and log in for tests
            hashed_password = self.bcrypt.generate_password_hash('password').decode('utf-8')
            user = User(username='testadmin', password=hashed_password, is_admin=True, is_approved=True)
            db.session.add(user)
            db.session.commit()

    def login(self):
         # Flask-Login doesn't easily work with test_client without session handling or login helper
         # But since we use simple form login
         with self.app.session_transaction() as sess:
            # We can't easily mock session in setUp with test_client,
            # instead we should post to login
            pass

         return self.app.post('/login', data=dict(
            username='testadmin',
            password='password'
        ), follow_redirects=True)

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def test_index_page(self):
        self.login()
        response = self.app.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'GitHub Workflow Generator', response.data)

    def test_generate_yaml(self):
        self.login()
        payload = {
            "name": "Test Workflow",
            "on": ["push", "pull_request"],
            "jobs": {
                "build": {
                    "runs-on": "ubuntu-latest",
                    "steps": [
                        {"name": "Checkout", "uses": "actions/checkout@v3"},
                        {"name": "Run Test", "run": "echo 'Testing'"}
                    ]
                }
            }
        }

        response = self.app.post('/generate',
                                 data=json.dumps(payload),
                                 content_type='application/json')

        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('yaml', data)

        yaml_content = data['yaml']
        self.assertIn('name: Test Workflow', yaml_content)
        self.assertIn('on:', yaml_content)
        self.assertIn('- push', yaml_content)
        self.assertIn('jobs:', yaml_content)
        self.assertIn('build:', yaml_content)
        self.assertIn('runs-on: ubuntu-latest', yaml_content)
        self.assertIn('steps:', yaml_content)
        self.assertIn('- name: Checkout', yaml_content)

if __name__ == '__main__':
    unittest.main()
