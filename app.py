import os
import json
import logging
import csv
from flask import Flask, render_template, jsonify, send_file, Response
from scraper import IMDbScraper

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)

# Resolve absolute path for the movies CSV file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "movies.csv")

def write_movies_to_csv(movies):
    """
    Writes a list of movie dictionaries to movies.csv using standard csv library.
    Bypasses Pandas to avoid AppLocker/WDAC DLL enforcement policies.
    """
    try:
        with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=["title", "rating", "year", "runtime", "runtime_minutes"])
            writer.writeheader()
            writer.writerows(movies)
        logging.info(f"Successfully cached {len(movies)} movies to {CSV_PATH}")
    except Exception as e:
        logging.error(f"Failed to write CSV cache: {str(e)}")

def read_movies_from_csv():
    """
    Reads movies from movies.csv using standard csv library and parses data types.
    Bypasses Pandas/NumPy to prevent C-extension DLL policy failures.
    """
    movies = []
    try:
        if os.path.exists(CSV_PATH):
            with open(CSV_PATH, 'r', newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    movies.append({
                        "title": row.get("title", ""),
                        "rating": float(row.get("rating", 0.0)) if row.get("rating") else 0.0,
                        "year": int(row.get("year", 2000)) if row.get("year") else 2000,
                        "runtime": row.get("runtime", "2h"),
                        "runtime_minutes": int(row.get("runtime_minutes", 120)) if row.get("runtime_minutes") else 120
                    })
    except Exception as e:
        logging.error(f"Failed to read CSV cache: {str(e)}")
    return movies

def ensure_initial_csv():
    """
    Ensures that a movies.csv file exists on initial startup.
    If not, it creates it using high-quality mock data so the app has immediate visual analytics.
    """
    if not os.path.exists(CSV_PATH):
        logging.info("movies.csv not found. Pre-populating with mock dataset for premium first-load experience.")
        scraper = IMDbScraper()
        write_movies_to_csv(scraper.MOCK_MOVIES)

@app.route('/')
def index():
    """Serves the primary web dashboard UI."""
    return render_template('index.html')

@app.route('/api/movies', methods=['GET'])
def get_movies():
    """
    Retrieves the current list of movies from the CSV file.
    Returns JSON formatted movie list.
    """
    try:
        ensure_initial_csv()
        if os.path.exists(CSV_PATH):
            movies = read_movies_from_csv()
            return jsonify({
                "status": "success",
                "count": len(movies),
                "movies": movies
            })
        else:
            return jsonify({
                "status": "error",
                "message": "CSV file could not be created."
            }), 500
    except Exception as e:
        logging.error(f"Error fetching movies: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Failed to retrieve movies: {str(e)}"
        }), 500

@app.route('/api/scrape', methods=['GET'])
def trigger_scrape():
    """
    Triggers a live scrape session. Uses Server-Sent Events (SSE) to stream 
    real-time console logs and scraping phases directly to the frontend loading dashboard.
    """
    def event_generator():
        scraper = IMDbScraper()
        messages_queue = []
        
        def cb(msg):
            messages_queue.append(msg)
            
        try:
            yield f"data: {json.dumps({'type': 'log', 'message': 'Starting Chrome browser in headless mode...'})}\n\n"
            
            # Run the scraper
            movies = scraper.scrape(update_progress_callback=cb)
            
            # Stream all messages that were queued up
            for msg in messages_queue:
                yield f"data: {json.dumps({'type': 'log', 'message': msg})}\n\n"
            
            # Save data to CSV (pure Python standard library)
            write_movies_to_csv(movies)
            
            yield f"data: {json.dumps({'type': 'complete', 'message': f'Success! Scraped {len(movies)} movies.', 'count': len(movies)})}\n\n"
            
        except Exception as e:
            logging.error(f"Error during streaming scrape: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'message': f'Scraping failed: {str(e)}'})}\n\n"
            
    return Response(event_generator(), mimetype='text/event-stream')

@app.route('/api/export', methods=['GET'])
def export_csv():
    """Serves the movies.csv file as a downloadable attachment."""
    try:
        ensure_initial_csv()
        if os.path.exists(CSV_PATH):
            return send_file(
                CSV_PATH,
                mimetype='text/csv',
                as_attachment=True,
                download_name='imdb_top_movies.csv'
            )
        else:
            return jsonify({
                "status": "error",
                "message": "CSV file does not exist."
            }), 404
    except Exception as e:
        logging.error(f"Error exporting CSV: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Export failed: {str(e)}"
        }), 500

if __name__ == '__main__':
    # Initialize initial CSV file so app is populated out of the box
    ensure_initial_csv()
    # Run the server on host 127.0.0.1 port 5000 in debug mode
    app.run(host='127.0.0.1', port=5000, debug=True)
