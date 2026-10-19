import tempfile
from pathlib import Path
import unittest
from property_processing.reconstruction_quality import summarize_model, select_complete_model

class ReconstructionQuality(unittest.TestCase):
    def test_complete_model_supersedes_overlap_but_not_disconnected_or_ambiguous_models(self):
        with tempfile.TemporaryDirectory() as directory:
            self.files(directory)
            complete = summarize_model(directory, ['a.png', 'b.png'])
            partial = {**complete, 'advisoryQualityPassed': False, 'registeredCameraCount': 1, 'unregisteredFrames': ['b.png']}
            self.assertEqual(select_complete_model([partial, complete], 2), [complete])
            self.assertEqual(select_complete_model([partial, partial], 2), [partial, partial])
            self.assertEqual(select_complete_model([complete, complete], 2), [complete, complete])
            disconnected = {**complete, 'connectedComponentCount': 2}
            self.assertEqual(select_complete_model([partial, disconnected], 2), [partial, disconnected])
    def files(self, directory, disconnected=False):
        Path(directory,'cameras.txt').write_text('# cameras\n1 PINHOLE 640 480 500 500 320 240\n')
        Path(directory,'images.txt').write_text('1 1 0 0 0 0 0 0 1 a.png\n1 2 1\n2 1 0 0 0 1 0 0 1 b.png\n3 4 1\n'+('3 1 0 0 0 2 0 0 1 c.png\n\n' if disconnected else ''))
        Path(directory,'points3D.txt').write_text('1 0 1 2 255 0 0 0.5 1 0 2 0\n')
    def test_actual_connectivity_errors_tracks_and_unscaled_bounds(self):
        with tempfile.TemporaryDirectory() as directory:
            self.files(directory)
            report=summarize_model(directory,['a.png','b.png'])
            self.assertEqual(report['connectedComponentCount'],1)
            self.assertEqual(report['trackLength']['median'],2)
            self.assertEqual(report['reprojectionErrorPixels']['median'],.5)
            self.assertEqual(report['bounds']['max'],[0,1,2])
            self.assertTrue(report['advisoryQualityPassed']);self.assertIsNone(report['scale']);self.assertIsNone(report['requiredRoomConnectivity'])
    def test_disconnected_room_and_unregistered_frames_require_recapture(self):
        with tempfile.TemporaryDirectory() as directory:
            self.files(directory,True)
            report=summarize_model(directory,['a.png','b.png','c.png','d.png','e.png'])
            self.assertEqual(report['connectedComponentCount'],2)
            self.assertEqual(report['unregisteredFrames'],['d.png','e.png'])
            self.assertFalse(report['advisoryQualityPassed'])
    def test_bad_tracks_nonfinite_pose_and_source_substitution_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            for name,body in [('points3D.txt','1 0 1 2 255 0 0 0.5 1 4 2 0\n'),('images.txt','1 nan 0 0 0 0 0 0 1 a.png\n\n')]:
                self.files(directory);Path(directory,name).write_text(body)
                with self.assertRaises(ValueError):summarize_model(directory,['a.png','b.png'])
            self.files(directory)
            with self.assertRaises(ValueError):summarize_model(directory,['unrelated.png','b.png'])
