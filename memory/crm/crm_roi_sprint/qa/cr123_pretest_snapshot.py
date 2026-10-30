import os,json;from dotenv import load_dotenv;load_dotenv('/app/backend/.env');from pymongo import MongoClient
db=MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
c=db.customers.find_one({'user_id':'pos_0001_restaurant_689','phone':'9830291686'},{'_id':0,'id':1,'total_points':1,'total_points_earned':1,'total_visits':1,'total_spent':1,'tier':1})
print(json.dumps(c))
