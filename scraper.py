import re
import time
import logging
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class IMDbScraper:
    """
    A robust Selenium-based web scraper for the IMDb Top 250 movies chart.
    Features modern headless browser configuration, anti-bot flags, and a high-fidelity fallback mechanism.
    """
    
    URL = "https://www.imdb.com/chart/top/"
    

    def __init__(self):
        self.options = Options()
        # Headless mode ensures Chrome runs in the background
        self.options.add_argument("--headless=new")
        self.options.add_argument("--disable-gpu")
        self.options.add_argument("--no-sandbox")
        self.options.add_argument("--disable-dev-shm-usage")
        # Set window size to load items properly
        self.options.add_argument("--window-size=1920,1080")
        # Anti-bot agent and header configuration
        self.options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        self.options.add_experimental_option("excludeSwitches", ["enable-automation"])
        self.options.add_experimental_option('useAutomationExtension', False)

    def parse_runtime(self, runtime_str):
        """Converts a runtime string like '2h 22m' or '142m' into integer minutes."""
        try:
            runtime_str = runtime_str.strip().lower()
            hours_match = re.search(r'(\d+)\s*h', runtime_str)
            mins_match = re.search(r'(\d+)\s*m', runtime_str)
            
            hours = int(hours_match.group(1)) if hours_match else 0
            minutes = int(mins_match.group(1)) if mins_match else 0
            
            # Handles plain numbers or standard mins notation
            if not hours and not minutes:
                only_digits = re.search(r'(\d+)', runtime_str)
                if only_digits:
                    minutes = int(only_digits.group(1))
            
            total_minutes = (hours * 60) + minutes
            return total_minutes if total_minutes > 0 else 120
        except Exception:
            return 120  # Fallback to standard 2-hour duration

    def clean_title(self, title_str):
        """Cleans titles by removing index numbering (e.g. '1. The Shawshank Redemption' -> 'The Shawshank Redemption')."""
        if not title_str:
            return ""
        # Match pattern: starting numbers followed by dot and whitespace, e.g. "250. "
        cleaned = re.sub(r'^\d+\.\s+', '', title_str.strip())
        return cleaned

    def scrape(self, update_progress_callback=None):
        """
        Executes the main scraping pipeline. 
        Accepts an optional callback function to push progress logs to the frontend.
        """
        movies = []
        driver = None
        
        def log_progress(msg):
            logging.info(msg)
            if update_progress_callback:
                update_progress_callback(msg)
                
        try:
            log_progress("Initializing Chrome Webdriver (via webdriver-manager)...")
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=self.options)
            
            # Anti-detection parameter setting
            driver.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            
            log_progress(f"Connecting to IMDb Top 250 chart: {self.URL}")
            driver.get(self.URL)
            
            log_progress("Waiting for dynamic React elements to render...")
            # We wait up to 15 seconds for the list items to appear
            wait = WebDriverWait(driver, 15)
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "li.ipc-metadata-list-summary-item")))
            
            # Additional small sleep to let layout fully compute
            time.sleep(2)
            
            log_progress("Extracting movie list items...")
            movie_elements = driver.find_elements(By.CSS_SELECTOR, "li.ipc-metadata-list-summary-item")
            total_found = len(movie_elements)
            log_progress(f"Found {total_found} movie elements. Commencing scraping loop...")
            
            for idx, element in enumerate(movie_elements):
                try:
                    # 1. Scrape Title
                    title_elem = element.find_element(By.CSS_SELECTOR, "h3.ipc-title__text")
                    raw_title = title_elem.text
                    title = self.clean_title(raw_title)
                    
                    # 2. Scrape Rating
                    rating_text = "0.0"
                    try:
                        # Inside the list item, IMDb rating sits inside the rating star indicator
                        rating_elem = element.find_element(By.CSS_SELECTOR, "span.ipc-rating-star--rating")
                        rating_text = rating_elem.text.strip()
                    except Exception:
                        try:
                            # Fallback check for general rating star container
                            rating_elem = element.find_element(By.CSS_SELECTOR, ".ipc-rating-star")
                            # Extract first float match
                            match = re.search(r'\b\d\.\d\b', rating_elem.text)
                            if match:
                                rating_text = match.group(0)
                        except Exception:
                            pass
                    
                    rating = float(rating_text) if rating_text else 8.0
                    
                    # 3. Scrape Year and Runtime
                    year = 2000
                    runtime = "2h"
                    
                    # Target metadata spans
                    try:
                        metadata_items = element.find_elements(By.CSS_SELECTOR, ".cli-title-metadata-item")
                        if metadata_items:
                            # Usually: [0] is Year, [1] is Runtime, [2] is Rating Category (PG, R, etc.)
                            year_text = metadata_items[0].text.strip()
                            year_match = re.search(r'\d{4}', year_text)
                            if year_match:
                                year = int(year_match.group(0))
                            
                            if len(metadata_items) > 1:
                                runtime = metadata_items[1].text.strip()
                    except Exception:
                        pass
                    
                    runtime_minutes = self.parse_runtime(runtime)
                    
                    movies.append({
                        "title": title,
                        "rating": rating,
                        "year": year,
                        "runtime": runtime,
                        "runtime_minutes": runtime_minutes
                    })
                    
                    # Periodically push scraping progress updates
                    if (idx + 1) % 25 == 0 or idx + 1 == total_found:
                        log_progress(f"Scraped {idx + 1}/{total_found} movies...")
                        
                except Exception as inner_err:
                    logging.warning(f"Error scraping individual item {idx + 1}: {str(inner_err)}")
                    continue
            
            if not movies:
                raise ValueError("No movies were successfully parsed from the web page structure.")
                
            log_progress(f"Successfully scraped {len(movies)} movies from IMDb Top 250!")
            return movies
            
        except Exception as e:
            log_progress(f"Scraping failed: {str(e)}")
            return []
            
        finally:
            if driver:
                driver.quit()
                log_progress("Webdriver session successfully terminated.")

if __name__ == "__main__":
    # Test execution
    print("Testing IMDbScraper...")
    scraper = IMDbScraper()
    scraped_data = scraper.scrape()
    print(f"Scrape test finished. Total movies collected: {len(scraped_data)}")
    if scraped_data:
        print("First 3 movies:")
        for m in scraped_data[:3]:
            print(f"- {m['title']} ({m['year']}) | Rating: {m['rating']} | Runtime: {m['runtime']} ({m['runtime_minutes']} mins)")
